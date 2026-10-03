// ============================================================
// GET /api/ai-alerts/noshow/cron
//
//   No-Show Predictor. Purely deterministic (no AI call) — for every
//   upcoming appointment without a risk score yet, looks at this same
//   contact's past appointments: no_show rate >= 30% (with at least 2
//   past appointments to judge from) = high risk, some history but a
//   clean record = low, no history at all = medium (unknown, not
//   assumed safe). Only WhatsApps the owner for 'high' risk
//   appointments inside the next 24h — far enough out to still call
//   and confirm, close enough that it's actually actionable today.
//
//   Protect with checkCronAuth('NOSHOW_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'

const BATCH_LIMIT = 50

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'NOSHOW_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()
  const now = new Date()
  const next24h = new Date(now.getTime() + 24 * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('ai_alert_settings')
    .select('account_id, owner_whatsapp_number, template_language, noshow_alert_template')
    .eq('noshow_alert_enabled', true)
    .limit(50)

  if (settingsErr) console.error('[noshow/cron] fetch settings failed:', settingsErr)

  let scoredCount = 0
  let alertedCount = 0

  for (const setting of settings ?? []) {
    const { data: upcoming, error: apptErr } = await admin
      .from('appointments')
      .select('id, contact_id, slot_id, no_show_risk, no_show_alerted_at')
      .eq('account_id', setting.account_id)
      .eq('status', 'confirmed')
      .is('no_show_risk', null)
      .limit(BATCH_LIMIT)

    if (apptErr) {
      console.error('[noshow/cron] fetch appointments failed:', setting.account_id, apptErr)
      continue
    }

    for (const appt of upcoming ?? []) {
      if (!appt.contact_id) continue

      const { data: history } = await admin
        .from('appointments')
        .select('status')
        .eq('contact_id', appt.contact_id)
        .neq('id', appt.id)
        .in('status', ['completed', 'no_show', 'cancelled'])

      const total = history?.length ?? 0
      const noShows = history?.filter((h) => h.status === 'no_show').length ?? 0

      let risk: 'low' | 'medium' | 'high'
      let reason: string
      if (total < 2) {
        risk = 'medium'
        reason = 'No booking history yet for this contact'
      } else {
        const rate = noShows / total
        if (rate >= 0.3) {
          risk = 'high'
          reason = `Missed ${noShows} of their last ${total} appointments`
        } else {
          risk = 'low'
          reason = `Clean record (${noShows}/${total} missed)`
        }
      }

      const { error: updateErr } = await admin
        .from('appointments')
        .update({ no_show_risk: risk, no_show_reason: reason })
        .eq('id', appt.id)
      if (updateErr) {
        console.error('[noshow/cron] update failed:', appt.id, updateErr)
        continue
      }
      scoredCount++

      if (risk !== 'high' || !setting.owner_whatsapp_number || !setting.noshow_alert_template) continue

      // Only worth a same-day nudge if the slot is actually soon.
      let slotWhen: string | null = null
      if (appt.slot_id) {
        const { data: slot } = await admin.from('booking_slots').select('start_at').eq('id', appt.slot_id).maybeSingle()
        slotWhen = slot?.start_at ?? null
      }
      if (!slotWhen || slotWhen > next24h) continue

      const { data: contact } = await admin.from('contacts').select('name, phone').eq('id', appt.contact_id).maybeSingle()

      try {
        await notifyOwnerTemplate({
          accountId: setting.account_id,
          to: setting.owner_whatsapp_number,
          templateName: setting.noshow_alert_template,
          language: setting.template_language,
          params: [contact?.name ?? 'A customer', contact?.phone ?? '', reason],
        })
        await admin.from('appointments').update({ no_show_alerted_at: new Date().toISOString() }).eq('id', appt.id)
        alertedCount++
      } catch (sendErr) {
        console.error('[noshow/cron] alert send failed:', appt.id, sendErr)
      }
    }
  }

  return NextResponse.json({ scoredCount, alertedCount })
}
