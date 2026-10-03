// ============================================================
// GET /api/ai-alerts/cashflow/cron
//
//   Cash Flow Crystal Ball. Deliberately NOT a full cash-flow model —
//   this schema has no expense tracking, so inventing a "you'll have
//   $X on the 15th" number would be fabricated precision. Honest,
//   deterministic scope instead: sum every `client_invoices` row
//   that's unpaid/overdue and due within `cashflow_danger_days` — "this
//   much is sitting uncollected and due soon, go get it." Same
//   calculation-not-fabrication rule as the existing /predictions page.
//
//   Runs once a day in practice (UNIQUE(account_id, alert_date) blocks
//   a second alert same day even if the pinger fires more often).
//   Only alerts when the total is > 0 — nothing to say otherwise.
//
//   Protect with checkCronAuth('CASHFLOW_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'CASHFLOW_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)

  const { data: settings, error: settingsErr } = await admin
    .from('ai_alert_settings')
    .select('account_id, owner_whatsapp_number, template_language, cashflow_alert_template, cashflow_danger_days')
    .eq('cashflow_alert_enabled', true)
    .not('owner_whatsapp_number', 'is', null)
    .not('cashflow_alert_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[cashflow/cron] fetch settings failed:', settingsErr)

  let checkedCount = 0
  let alertedCount = 0

  for (const setting of settings ?? []) {
    checkedCount++

    const { data: existing } = await admin
      .from('cashflow_alerts')
      .select('id')
      .eq('account_id', setting.account_id)
      .eq('alert_date', today)
      .maybeSingle()
    if (existing) continue

    const dangerCutoff = new Date(Date.now() + setting.cashflow_danger_days * 86400000).toISOString().slice(0, 10)

    const { data: invoices, error: invErr } = await admin
      .from('client_invoices')
      .select('amount, currency, due_date, status')
      .eq('account_id', setting.account_id)
      .in('status', ['unpaid', 'overdue'])
      .not('due_date', 'is', null)
      .lte('due_date', dangerCutoff)

    if (invErr) {
      console.error('[cashflow/cron] fetch invoices failed:', setting.account_id, invErr)
      continue
    }
    if (!invoices?.length) continue

    const total = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0)
    if (total <= 0) continue

    const currency = invoices[0]?.currency ?? 'USD'

    const { error: insertErr } = await admin.from('cashflow_alerts').insert({
      account_id: setting.account_id,
      alert_date: today,
      projected_shortfall: total,
      currency,
    })
    if (insertErr) {
      console.error('[cashflow/cron] insert failed:', setting.account_id, insertErr)
      continue
    }

    try {
      await notifyOwnerTemplate({
        accountId: setting.account_id,
        to: setting.owner_whatsapp_number,
        templateName: setting.cashflow_alert_template,
        language: setting.template_language,
        params: [`${currency} ${total.toLocaleString()}`, String(setting.cashflow_danger_days)],
      })
      alertedCount++
    } catch (sendErr) {
      console.error('[cashflow/cron] alert send failed:', setting.account_id, sendErr)
    }
  }

  return NextResponse.json({ checkedCount, alertedCount })
}
