import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { decryptText } from '@/lib/crypto'

// POST /api/agent/generate-actions — the Daily Agent's morning scan,
// scoped to what's real today: cold leads (status='new', 3+ days old,
// with a linked contact + conversation so a follow-up can actually
// send). Drafts a short WhatsApp follow-up per lead using the
// account's own Claude key + whatever Business Knowledge exists, and
// queues it as agent_actions status='draft'. Nothing sends here —
// see /api/agent/actions/[id]/approve for the only path that
// actually messages a real customer.
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })
    const accountId = profile.account_id

    const { data: coldLeads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, customer_name, service_type, company, contact_id, conversation_id, created_at')
      .eq('account_id', accountId)
      .eq('status', 'new')
      .lt('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
      .not('contact_id', 'is', null)
      .not('conversation_id', 'is', null)
      .limit(15)
    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })
    if (!coldLeads || coldLeads.length === 0) {
      return NextResponse.json({ created: 0, message: 'No cold leads with an active conversation right now.' })
    }

    // Skip leads that already have a pending draft or a very recent action
    const { data: existing } = await supabase
      .from('agent_actions')
      .select('lead_id')
      .eq('account_id', accountId)
      .in('lead_id', coldLeads.map((l) => l.id))
      .in('status', ['draft', 'sent'])
    const alreadyQueued = new Set((existing ?? []).map((r) => r.lead_id))
    const targets = coldLeads.filter((l) => !alreadyQueued.has(l.id))
    if (targets.length === 0) {
      return NextResponse.json({ created: 0, message: 'All cold leads already have a queued or sent follow-up.' })
    }

    const { data: aiConfig } = await supabase.from('ai_config').select('claude_api_key').eq('account_id', accountId).maybeSingle()
    let claudeKey: string | null = null
    if (aiConfig?.claude_api_key) {
      try { claudeKey = decryptText(aiConfig.claude_api_key) } catch { claudeKey = null }
    }
    if (!claudeKey) return NextResponse.json({ error: 'No Claude API key configured — add one in Settings → AI Insights.' }, { status: 400 })

    const { data: knowledge } = await supabase.from('business_knowledge').select('title, content').eq('account_id', accountId).eq('category', 'tone').limit(3)
    const toneHint = (knowledge ?? []).map((k) => `${k.title}: ${k.content}`).join('\n')

    const anthropic = new Anthropic({ apiKey: claudeKey })
    let created = 0
    for (const lead of targets) {
      const daysColdOn = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000)
      const draftRes = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 150,
        system: `Write a short WhatsApp follow-up message (2-3 sentences max, no greeting like "Dear", casual but professional) to a lead who went cold. Do not invent pricing or facts not given. ${toneHint ? `Tone guide: ${toneHint}` : ''} Output only the message text, nothing else.`,
        messages: [{
          role: 'user',
          content: `Lead: ${lead.customer_name ?? 'Unknown'}${lead.company ? ` (${lead.company})` : ''}. Interested in: ${lead.service_type ?? 'unspecified service'}. No reply in ${daysColdOn} days.`,
        }],
      })
      const draftedText = draftRes.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
      if (!draftedText) continue

      const { error: insertErr } = await supabase.from('agent_actions').insert({
        account_id: accountId,
        kind: 'followup_message',
        lead_id: lead.id,
        contact_id: lead.contact_id,
        conversation_id: lead.conversation_id,
        reason: `Cold ${daysColdOn} days — no reply since lead created`,
        drafted_text: draftedText,
        status: 'draft',
      })
      if (!insertErr) created++
    }

    return NextResponse.json({ created })
  } catch (err) {
    console.error('[agent/generate-actions POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
