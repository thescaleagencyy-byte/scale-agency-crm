import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkCronAuth } from '@/lib/cron-auth'
import { getGmailCredentials, sendEmail } from '@/lib/outreach/mailer'
import { applyMergeVars } from '@/lib/outreach/merge-vars'
import { buildUnsubscribeUrl } from '@/lib/outreach/unsubscribe-token'

// GET /api/outreach/cron
//
// Drains outreach_enrollments where next_send_at <= now() and
// status = 'active' — same shape as /api/drip/cron, plus what cold
// email actually needs on top: a per-sequence daily cap and send
// window (checked BEFORE sending, not after — the point is to never
// blast), and a suppression check (unsubscribed/bounced) that skips
// a prospect even if their enrollment row is still 'active'.
//
// A small batch per run (not the full daily cap at once) so real
// sends spread across the day instead of bursting — this cron is
// meant to be hit every 15-30 min by an external scheduler, not once
// a day.
const BATCH_LIMIT = 3

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'OUTREACH_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://scale-agency-crm.vercel.app').replace(/\/+$/, '')

  const { data: due, error } = await admin
    .from('outreach_enrollments')
    .select('*, sequence:outreach_sequences(account_id, status, daily_cap, send_window_start_hour, send_window_end_hour), prospect:outreach_prospects(id, email, name, company, status)')
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .limit(50)

  if (error) {
    console.error('[outreach/cron] fetch failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  let failed = 0
  const sentTodayBySequence = new Map<string, number>()
  const credsByAccount = new Map<string, Awaited<ReturnType<typeof getGmailCredentials>>>()

  for (const enrollment of due ?? []) {
    if (sent >= BATCH_LIMIT) break

    const sequence = enrollment.sequence
    const prospect = enrollment.prospect
    if (!sequence || sequence.status !== 'active' || !prospect) continue

    // Send window — skip outside local-ish business hours rather than
    // failing the enrollment; it stays due and gets picked up on a
    // later run within the window.
    const hour = now.getUTCHours()
    if (hour < sequence.send_window_start_hour || hour >= sequence.send_window_end_hour) {
      skipped++
      continue
    }

    // Suppressed prospects (unsubscribed/bounced/complained) are
    // skipped and stopped regardless of what the enrollment row says
    // — the suppression list is the source of truth, checked fresh
    // every run rather than trusted from enrollment state alone.
    const { data: suppressed } = await admin
      .from('outreach_suppressions')
      .select('id')
      .eq('account_id', sequence.account_id)
      .ilike('email', prospect.email)
      .maybeSingle()
    if (suppressed || prospect.status !== 'active') {
      await admin.from('outreach_enrollments').update({ status: 'unsubscribed' }).eq('id', enrollment.id)
      skipped++
      continue
    }

    // Daily cap — count real sends today for this sequence, cached
    // per sequence within this run since multiple due enrollments
    // usually share a sequence.
    let sentToday = sentTodayBySequence.get(enrollment.sequence_id)
    if (sentToday === undefined) {
      const startOfDay = new Date(now)
      startOfDay.setUTCHours(0, 0, 0, 0)
      const { count } = await admin
        .from('outreach_sends')
        .select('id', { count: 'exact', head: true })
        .eq('sequence_id', enrollment.sequence_id)
        .eq('status', 'sent')
        .gte('sent_at', startOfDay.toISOString())
      sentToday = count ?? 0
      sentTodayBySequence.set(enrollment.sequence_id, sentToday)
    }
    if (sentToday >= sequence.daily_cap) {
      skipped++
      continue
    }

    const { data: step } = await admin
      .from('outreach_steps')
      .select('*')
      .eq('sequence_id', enrollment.sequence_id)
      .eq('position', enrollment.current_step)
      .maybeSingle()

    if (!step) {
      await admin.from('outreach_enrollments').update({ status: 'completed', completed_at: nowIso }).eq('id', enrollment.id)
      continue
    }

    let creds = credsByAccount.get(sequence.account_id)
    if (creds === undefined) {
      creds = await getGmailCredentials(admin, sequence.account_id)
      credsByAccount.set(sequence.account_id, creds)
    }
    if (!creds) {
      console.error(`[outreach/cron] no connected Gmail for account ${sequence.account_id}`)
      continue
    }

    const unsubscribeUrl = buildUnsubscribeUrl(baseUrl, prospect.id, prospect.email)
    const result = await sendEmail(creds, {
      to: prospect.email,
      subject: applyMergeVars(step.subject, prospect),
      text: applyMergeVars(step.body, prospect),
      unsubscribeUrl,
    })

    await admin.from('outreach_sends').insert({
      enrollment_id: enrollment.id,
      step_id: step.id,
      prospect_id: prospect.id,
      account_id: sequence.account_id,
      sequence_id: enrollment.sequence_id,
      subject: step.subject,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.error ?? null,
      message_id: result.messageId ?? null,
    })

    if (!result.ok) {
      console.error(`[outreach/cron] send failed for enrollment ${enrollment.id}:`, result.error)
      await admin.from('outreach_enrollments').update({ status: 'failed' }).eq('id', enrollment.id)
      failed++
      continue
    }

    sentTodayBySequence.set(enrollment.sequence_id, sentToday + 1)

    const { data: nextStep } = await admin
      .from('outreach_steps')
      .select('delay_days')
      .eq('sequence_id', enrollment.sequence_id)
      .eq('position', enrollment.current_step + 1)
      .maybeSingle()

    if (nextStep) {
      const nextSendAt = new Date()
      nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days)
      await admin.from('outreach_enrollments').update({
        current_step: enrollment.current_step + 1,
        next_send_at: nextSendAt.toISOString(),
      }).eq('id', enrollment.id)
    } else {
      await admin.from('outreach_enrollments').update({ status: 'completed', completed_at: nowIso }).eq('id', enrollment.id)
    }
    sent++
  }

  return NextResponse.json({ sent, skipped, failed, processed: (due ?? []).length })
}
