// ============================================================
// GET /api/ai-alerts/complaint-warning/cron
//
//   Complaint-Before-It-Explodes. For every account with
//   complaint_alert_enabled, scans OPEN conversations with a recent
//   customer message (within the last 2h — this has to run often to
//   catch it while there's still time to fix it, unlike the other
//   alerts) and no existing complaint_warnings row, reads the
//   sentiment TREND across the last ~15 messages (not just the latest
//   one — one grumpy message isn't the same as steadily escalating
//   frustration), and WhatsApps the owner when it's rising or high.
//   UNIQUE(conversation_id) means this fires at most once per
//   conversation — see migration comment for the tradeoff.
//
//   Protect with checkCronAuth('COMPLAINT_ALERT_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 30

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'COMPLAINT_ALERT_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ checkedCount: 0, alertedCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()
  const recentCutoff = new Date(Date.now() - 2 * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('ai_alert_settings')
    .select('account_id, owner_whatsapp_number, template_language, complaint_alert_template')
    .eq('complaint_alert_enabled', true)
    .not('owner_whatsapp_number', 'is', null)
    .not('complaint_alert_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[complaint-warning/cron] fetch settings failed:', settingsErr)

  let checkedCount = 0
  let alertedCount = 0

  for (const setting of settings ?? []) {
    const { data: candidates, error: convErr } = await admin
      .from('conversations')
      .select('id, contact_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'open')
      .gte('last_message_at', recentCutoff)
      .limit(BATCH_LIMIT)

    if (convErr) {
      console.error('[complaint-warning/cron] fetch conversations failed:', setting.account_id, convErr)
      continue
    }

    for (const convo of candidates ?? []) {
      const { data: existing } = await admin
        .from('complaint_warnings')
        .select('id')
        .eq('conversation_id', convo.id)
        .maybeSingle()
      if (existing) continue

      const { data: messages } = await admin
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', convo.id)
        .order('created_at', { ascending: false })
        .limit(15)

      const lastCustomerMsg = messages?.find((m) => m.sender_type === 'customer')
      if (!lastCustomerMsg) continue

      const transcript = decryptMessages((messages ?? []).slice().reverse())
        .filter((m) => m.content_text)
        .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text}`)
        .join('\n')
      if (!transcript.trim()) { checkedCount++; continue }

      checkedCount++

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Read this WhatsApp conversation and judge whether the CUSTOMER\'s frustration is escalating across the thread (not just whether the latest message is negative — a trend of increasingly short/annoyed/repeated messages, or an explicit threat to leave a bad review / cancel / go to a competitor). Return strict JSON: {"risk_level": "none"|"rising"|"high", "reason": "one plain-language sentence, quote something real if it supports the judgment"}.',
            },
            { role: 'user', content: transcript.slice(0, 8000) },
          ],
          temperature: 0.2,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
        const riskLevel = parsed.risk_level
        if (riskLevel !== 'rising' && riskLevel !== 'high') continue

        const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : ''

        const { error: insertErr } = await admin.from('complaint_warnings').insert({
          account_id: setting.account_id,
          conversation_id: convo.id,
          risk_level: riskLevel,
          ai_reason: reason,
        })
        if (insertErr) {
          console.error('[complaint-warning/cron] insert failed:', convo.id, insertErr)
          continue
        }

        try {
          await notifyOwnerTemplate({
            accountId: setting.account_id,
            to: setting.owner_whatsapp_number,
            templateName: setting.complaint_alert_template,
            language: setting.template_language,
            params: [riskLevel, reason],
          })
          alertedCount++
        } catch (sendErr) {
          console.error('[complaint-warning/cron] alert send failed:', convo.id, sendErr)
        }
      } catch (aiErr) {
        console.error('[complaint-warning/cron] AI check failed:', convo.id, aiErr)
      }
    }
  }

  return NextResponse.json({ checkedCount, alertedCount })
}
