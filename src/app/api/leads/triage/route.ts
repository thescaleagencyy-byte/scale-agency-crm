import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 25

// POST /api/leads/triage
//
// Replaces "reading every conversation by hand" (done manually during
// the 2026-08-16 CRM audit — it's what found the lawyer who asked for
// a callback and the customer complaining about duplicate messages,
// both of which the dumb has_name/has_company point score rated the
// same as spam). One user-triggered pass, not a background cron —
// mirrors the existing "Calculate insights" / "Scan for cold leads"
// button pattern rather than running unattended.
//
// Body: { lead_id?: string } — one lead, or omit to triage every
// untriaged lead for the caller's account (capped at BATCH_LIMIT per
// call so a large backlog doesn't blow past a request timeout or run
// up an unbounded OpenAI bill in one click).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ error: 'AI not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  const leadId: string | undefined = body?.lead_id

  let query = supabase
    .from('leads')
    .select('id, customer_name, company, service_type, raw_handoff, conversation_id')
    .is('ai_triaged_at', null)

  query = leadId ? query.eq('id', leadId) : query.limit(BATCH_LIMIT)

  const { data: leads, error: fetchError } = await query
  if (fetchError) {
    console.error('[leads/triage] fetch failed:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch leads.' }, { status: 500 })
  }
  if (!leads?.length) return NextResponse.json({ triaged: 0, results: [] })

  const results: Array<{ lead_id: string; quality: string; summary: string }> = []

  for (const lead of leads) {
    let transcript = ''
    if (lead.conversation_id) {
      const { data: messages } = await supabase
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', lead.conversation_id)
        .order('created_at', { ascending: true })
        .limit(60)
      if (messages?.length) {
        transcript = decryptMessages(messages)
          .filter((m) => m.content_text)
          .map((m) => `${m.sender_type === 'customer' ? 'Customer' : m.sender_type === 'bot' ? 'Bot' : 'Agent'}: ${m.content_text}`)
          .join('\n')
      }
    }

    // Conversation transcript is the real signal; raw_handoff and the
    // structured fields are fallback context when a transcript isn't
    // available (older leads, or the conversation link is missing).
    const context = transcript?.trim()
      ? transcript
      : [lead.raw_handoff, lead.company, lead.service_type].filter(Boolean).join('\n') || '(no content captured)'

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You triage inbound WhatsApp leads for a sales team. Read the conversation and judge REAL buying intent — not whether structured fields like a business name were filled in, the intent behind what the person actually wrote. A short message with a clear ask ("call me", "I need X for my business") is hotter than a long conversation that's just emoji, stickers, or off-topic chat. Spam, flirting, or bot/media loops with no real content is "cold". Return strict JSON: {"quality": "hot"|"warm"|"cold", "summary": "one sentence, plain language, quote something real from the conversation if it supports your judgment"}.`,
          },
          { role: 'user', content: context },
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      })

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      const quality = ['hot', 'warm', 'cold'].includes(parsed.quality) ? parsed.quality : 'cold'
      const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : ''

      const { error: updateError } = await supabase
        .from('leads')
        .update({ ai_quality: quality, ai_summary: summary, ai_triaged_at: new Date().toISOString() })
        .eq('id', lead.id)

      if (updateError) {
        console.error('[leads/triage] update failed for', lead.id, updateError)
        continue
      }
      results.push({ lead_id: lead.id, quality, summary })
    } catch (err) {
      console.error('[leads/triage] OpenAI call failed for', lead.id, err)
    }
  }

  return NextResponse.json({ triaged: results.length, results })
}
