// ============================================================
// GET /api/growth-features/review-request/cron
//
//   Review Request Autopilot. For every account with
//   review_request_enabled, finds recent "happy moment" events — a
//   deal marked won, a client_invoice marked paid, an appointment
//   marked completed — with no existing review_requests row, and
//   sends an approved template with the owner's review link
//   (Google/Facebook/etc) to the CUSTOMER. UNIQUE(source_type,
//   source_id) on the table is the real de-dupe guard; the
//   existing-row check here just skips wasted work before hitting it.
//
//   Uses `engineSendTemplate` (not `notifyOwnerTemplate`) — this
//   message goes to a CUSTOMER, so it must go through the normal
//   contact/conversation tenancy check (a contact row scoped to this
//   account, resolved via an existing conversation), the same safety
//   boundary every other customer-facing send in this app respects.
//   `notifyOwnerTemplate` deliberately skips that check (it exists so
//   an arbitrary admin number can be messaged) — using it for a
//   customer send would quietly bypass the one tenancy guard that
//   matters most.
//
//   Looks back 48h on each source (not "all time") so turning this on
//   doesn't suddenly review-request every customer from the account's
//   entire history — only things that happened recently.
//
//   Protect with checkCronAuth('REVIEW_REQUEST_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { checkCronAuth } from '@/lib/cron-auth'

const BATCH_LIMIT = 50
const LOOKBACK_HOURS = 48

type SourceType = 'deal' | 'invoice' | 'appointment'

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'REVIEW_REQUEST_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()
  const lookback = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('growth_feature_settings')
    .select('account_id, template_language, review_request_template, review_request_link')
    .eq('review_request_enabled', true)
    .not('review_request_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[review-request/cron] fetch settings failed:', settingsErr)

  let sentCount = 0
  let skippedNoConversation = 0

  for (const setting of settings ?? []) {
    const sources: { type: SourceType; id: string; contactId: string | null }[] = []

    const { data: wonDeals } = await admin
      .from('deals')
      .select('id, contact_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'won')
      .gte('updated_at', lookback)
      .limit(BATCH_LIMIT)
    for (const d of wonDeals ?? []) sources.push({ type: 'deal', id: d.id, contactId: d.contact_id })

    const { data: paidInvoices } = await admin
      .from('client_invoices')
      .select('id, contact_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'paid')
      .gte('paid_at', lookback)
      .limit(BATCH_LIMIT)
    for (const i of paidInvoices ?? []) sources.push({ type: 'invoice', id: i.id, contactId: i.contact_id })

    const { data: completedAppts } = await admin
      .from('appointments')
      .select('id, contact_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'completed')
      .gte('updated_at', lookback)
      .limit(BATCH_LIMIT)
    for (const a of completedAppts ?? []) sources.push({ type: 'appointment', id: a.id, contactId: a.contact_id })

    for (const source of sources) {
      if (!source.contactId) continue

      const { data: existing } = await admin
        .from('review_requests')
        .select('id')
        .eq('source_type', source.type)
        .eq('source_id', source.id)
        .maybeSingle()
      if (existing) continue

      // Needs an existing conversation to send through (tenancy +
      // 24h-window bookkeeping both key off conversation_id in the
      // shared send path) — a contact with no WhatsApp thread at all
      // can't be reached this way.
      const { data: conversation } = await admin
        .from('conversations')
        .select('id, user_id')
        .eq('contact_id', source.contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!conversation) { skippedNoConversation++; continue }

      const { data: reqRow, error: insertErr } = await admin
        .from('review_requests')
        .insert({ account_id: setting.account_id, contact_id: source.contactId, source_type: source.type, source_id: source.id })
        .select('id')
        .single()
      if (insertErr) {
        if (insertErr.code !== '23505') console.error('[review-request/cron] insert failed:', source, insertErr)
        continue
      }

      try {
        await engineSendTemplate({
          accountId: setting.account_id,
          userId: conversation.user_id,
          conversationId: conversation.id,
          contactId: source.contactId,
          templateName: setting.review_request_template!,
          language: setting.template_language,
          params: [setting.review_request_link ?? ''],
        })
        await admin.from('review_requests').update({ sent_at: new Date().toISOString() }).eq('id', reqRow.id)
        sentCount++
      } catch (sendErr) {
        console.error('[review-request/cron] send failed:', source, sendErr)
      }
    }
  }

  return NextResponse.json({ sentCount, skippedNoConversation })
}
