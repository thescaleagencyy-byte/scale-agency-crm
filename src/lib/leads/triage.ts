import type { SupabaseClient } from '@supabase/supabase-js'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

export interface TriageResult {
  quality: 'hot' | 'warm' | 'cold'
  summary: string
}

interface TriageableLead {
  id: string
  raw_handoff?: string | null
  company?: string | null
  service_type?: string | null
  conversation_id?: string | null
}

// Shared by /api/leads/triage (manual, user-triggered batch) and
// /api/n8n/lead (automatic, fired right after a new lead is saved) —
// same judgment logic either way, just a different caller/client.
export async function triageLead(
  supabase: SupabaseClient,
  lead: TriageableLead
): Promise<TriageResult | null> {
  const openai = getOpenAIClient()
  if (!openai) return null

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

  const context = transcript?.trim()
    ? transcript
    : [lead.raw_handoff, lead.company, lead.service_type].filter(Boolean).join('\n') || '(no content captured)'

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
  const quality: TriageResult['quality'] = ['hot', 'warm', 'cold'].includes(parsed.quality) ? parsed.quality : 'cold'
  const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : ''

  const { error: updateError } = await supabase
    .from('leads')
    .update({ ai_quality: quality, ai_summary: summary, ai_triaged_at: new Date().toISOString() })
    .eq('id', lead.id)

  if (updateError) throw updateError

  return { quality, summary }
}
