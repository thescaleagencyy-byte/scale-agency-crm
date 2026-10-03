// ============================================================
// GET /api/ai-alerts/staff-audit/cron
//
//   Staff Accountability Audit. For every account with
//   staff_audit_enabled, finds conversations that look "done" (closed,
//   or idle 2h+) with at least one agent reply and no existing audit
//   row, has AI score reply speed/tone/outcome 0-100, and records it.
//   Always recorded (builds a per-staff history); WhatsApps the owner
//   only when a score falls below staff_audit_min_score, so this
//   doesn't become noise on every normal conversation.
//
//   Protect with checkCronAuth('STAFF_AUDIT_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 30

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'STAFF_AUDIT_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ auditedCount: 0, alertedCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()
  const idleCutoff = new Date(Date.now() - 2 * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('ai_alert_settings')
    .select('account_id, owner_whatsapp_number, template_language, staff_audit_enabled, staff_audit_template, staff_audit_min_score')
    .eq('staff_audit_enabled', true)
    .limit(50)

  if (settingsErr) console.error('[staff-audit/cron] fetch settings failed:', settingsErr)

  let auditedCount = 0
  let alertedCount = 0

  for (const setting of settings ?? []) {
    const { data: candidates, error: convErr } = await admin
      .from('conversations')
      .select('id, user_id, assigned_agent_id, status, last_message_at')
      .eq('account_id', setting.account_id)
      .or(`status.eq.closed,last_message_at.lt.${idleCutoff}`)
      .limit(BATCH_LIMIT)

    if (convErr) {
      console.error('[staff-audit/cron] fetch conversations failed:', setting.account_id, convErr)
      continue
    }

    for (const convo of candidates ?? []) {
      const { data: existing } = await admin
        .from('staff_performance_audits')
        .select('id')
        .eq('conversation_id', convo.id)
        .maybeSingle()
      if (existing) continue

      const { data: messages } = await admin
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', convo.id)
        .order('created_at', { ascending: true })
        .limit(80)

      const hasAgentMessage = messages?.some((m) => m.sender_type === 'agent')
      if (!hasAgentMessage) continue

      const transcript = decryptMessages(messages ?? [])
        .filter((m) => m.content_text)
        .map((m) => `[${m.created_at}] ${m.sender_type === 'customer' ? 'Customer' : m.sender_type === 'bot' ? 'Bot' : 'Agent'}: ${m.content_text}`)
        .join('\n')
      if (!transcript.trim()) continue

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You audit a support/sales agent\'s handling of ONE WhatsApp conversation. Judge: reply speed (gaps between customer message and agent reply, using the timestamps), tone (polite/curt/rude), and outcome (did the agent actually address what the customer asked). Score 0-100 (100 = fast, polite, resolved; under 40 = a real problem — rude, ignored the customer, or lost an obvious sale through inaction). Return strict JSON: {"score": 0-100, "issues": ["short tags like slow_reply, curt_tone, ignored_question, lost_sale"], "summary": "one plain-language sentence an owner would understand, quote something real if it supports the score"}.',
            },
            { role: 'user', content: transcript.slice(0, 12000) },
          ],
          temperature: 0.2,
          max_tokens: 250,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
        const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 70
        const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6) : []
        const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : ''

        const staffUserId = convo.assigned_agent_id ?? convo.user_id

        const { data: auditRow, error: insertErr } = await admin
          .from('staff_performance_audits')
          .insert({
            account_id: setting.account_id,
            conversation_id: convo.id,
            staff_user_id: staffUserId,
            score,
            issues,
            ai_summary: summary,
          })
          .select('id')
          .single()

        if (insertErr) {
          console.error('[staff-audit/cron] insert failed:', convo.id, insertErr)
          continue
        }
        auditedCount++

        if (score < setting.staff_audit_min_score && setting.owner_whatsapp_number && setting.staff_audit_template) {
          let staffName = 'A team member'
          if (staffUserId) {
            const { data: profile } = await admin.from('profiles').select('full_name').eq('user_id', staffUserId).maybeSingle()
            if (profile?.full_name) staffName = profile.full_name
          }

          try {
            await notifyOwnerTemplate({
              accountId: setting.account_id,
              to: setting.owner_whatsapp_number,
              templateName: setting.staff_audit_template,
              language: setting.template_language,
              params: [staffName, String(score), summary],
            })
            await admin.from('staff_performance_audits').update({ alerted_at: new Date().toISOString() }).eq('id', auditRow.id)
            alertedCount++
          } catch (sendErr) {
            console.error('[staff-audit/cron] alert send failed:', convo.id, sendErr)
          }
        }
      } catch (aiErr) {
        console.error('[staff-audit/cron] AI scoring failed:', convo.id, aiErr)
      }
    }
  }

  return NextResponse.json({ auditedCount, alertedCount })
}
