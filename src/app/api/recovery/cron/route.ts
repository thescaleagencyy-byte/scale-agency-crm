// ============================================================
// GET /api/recovery/cron
//
// Two passes, both idempotent — safe to run on any schedule
// (suggest every 30-60min via an external pinger, same pattern as
// /api/drip/cron and /api/automations/cron):
//
//   1. Mark recovered: any open recovery_attempts row (recovered_at
//      IS NULL) whose conversation has a customer reply after
//      sent_at gets closed out, with recovered_value pulled from a
//      deal that closed 'won' for that contact after the send.
//   2. Send new attempts: for every account with recovery_settings
//      enabled, find open conversations idle >= idle_days with no
//      already-open recovery_attempts row, and send the configured
//      template (plain text would be rejected by Meta outside the
//      24h window, which is exactly the case here by definition).
//
// Protect with RECOVERY_CRON_SECRET header (x-cron-secret) or
// ?secret= query param, same convention as the other cron routes.
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'

const BATCH_LIMIT = 50

export async function GET(request: Request) {
  const secret = process.env.RECOVERY_CRON_SECRET
  const auth = request.headers.get('x-cron-secret') ?? new URL(request.url).searchParams.get('secret')
  if (secret && auth !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date()

  // ---- Pass 1: mark recovered ----
  let recoveredCount = 0
  {
    const { data: openAttempts, error } = await admin
      .from('recovery_attempts')
      .select('id, account_id, conversation_id, contact_id, sent_at')
      .is('recovered_at', null)
      .limit(200)

    if (error) {
      console.error('[recovery/cron] fetch open attempts failed:', error)
    }

    for (const attempt of openAttempts ?? []) {
      const { data: reply } = await admin
        .from('messages')
        .select('created_at')
        .eq('conversation_id', attempt.conversation_id)
        .eq('sender_type', 'customer')
        .gt('created_at', attempt.sent_at)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!reply) continue

      // Best-effort: a deal for this contact that closed won after
      // the recovery send. Null is fine — the attempt still counts
      // as a recovered conversation without a dollar figure attached.
      const { data: deal } = await admin
        .from('deals')
        .select('value')
        .eq('contact_id', attempt.contact_id)
        .eq('status', 'won')
        .gte('closed_at', attempt.sent_at)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: updateErr } = await admin
        .from('recovery_attempts')
        .update({ recovered_at: reply.created_at, recovered_value: deal?.value ?? null })
        .eq('id', attempt.id)

      if (!updateErr) recoveredCount++
    }
  }

  // ---- Pass 2: send new attempts ----
  let sentCount = 0
  let failedCount = 0
  {
    const { data: settings, error } = await admin
      .from('recovery_settings')
      .select('account_id, idle_days, template_name, template_language')
      .eq('enabled', true)
      .not('template_name', 'is', null)
      .limit(50)

    if (error) {
      console.error('[recovery/cron] fetch settings failed:', error)
    }

    for (const setting of settings ?? []) {
      const idleCutoff = new Date(now.getTime() - setting.idle_days * 86400000).toISOString()

      const { data: coldConvos } = await admin
        .from('conversations')
        .select('id, contact_id, user_id, last_message_at')
        .eq('account_id', setting.account_id)
        .eq('status', 'open')
        .lt('last_message_at', idleCutoff)
        .limit(BATCH_LIMIT)

      for (const convo of coldConvos ?? []) {
        // Skip if there's already an unresolved attempt for this
        // conversation — the idx_recovery_attempts_open_conv index
        // makes this cheap.
        const { data: existing } = await admin
          .from('recovery_attempts')
          .select('id')
          .eq('conversation_id', convo.id)
          .is('recovered_at', null)
          .maybeSingle()
        if (existing) continue

        try {
          await engineSendTemplate({
            accountId: setting.account_id,
            userId: convo.user_id,
            conversationId: convo.id,
            contactId: convo.contact_id,
            templateName: setting.template_name!,
            language: setting.template_language,
          })
          await admin.from('recovery_attempts').insert({
            account_id: setting.account_id,
            conversation_id: convo.id,
            contact_id: convo.contact_id,
          })
          sentCount++
        } catch (sendErr) {
          console.error('[recovery/cron] send failed:', convo.id, sendErr)
          failedCount++
        }
      }
    }
  }

  return NextResponse.json({ recoveredCount, sentCount, failedCount })
}
