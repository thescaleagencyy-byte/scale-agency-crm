// ============================================================
// GET /api/lead-alerts/cron
//
//   For every account with lead_alert_settings.enabled, finds leads
//   that are:
//     - ai_quality = 'hot'   (AI triage already flagged this one)
//     - status = 'new'       (nobody has acted on it yet)
//     - created_at between (now - 24h) and (now - threshold_minutes)
//       — old enough to count as "still untouched", not so old that
//       a cron outage dumps a flood of stale alerts once it resumes
//     - no existing lead_alerts row (the UNIQUE(lead_id) constraint
//       is the actual guarantee; this check just avoids a wasted
//       Stripe-style double-send attempt)
//
//   and WhatsApps the account owner directly via
//   notifyOwnerTemplate — same "pre-approved template, outside the
//   24h customer window doesn't apply since this isn't a customer
//   conversation, but Meta still requires an approved template for
//   any business-initiated message" rule as /api/recovery/cron.
//
//   Protect with LEAD_ALERT_CRON_SECRET (x-cron-secret header or
//   ?secret= query param), same convention as every other cron route
//   — see src/lib/cron-auth.ts.
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'

const BATCH_LIMIT = 50
const MAX_LEAD_AGE_HOURS = 24

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'LEAD_ALERT_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()
  const now = Date.now()

  const { data: settings, error: settingsErr } = await admin
    .from('lead_alert_settings')
    .select('account_id, threshold_minutes, owner_whatsapp_number, template_name, template_language')
    .eq('enabled', true)
    .not('template_name', 'is', null)
    .not('owner_whatsapp_number', 'is', null)
    .limit(50)

  if (settingsErr) {
    console.error('[lead-alerts/cron] fetch settings failed:', settingsErr)
  }

  let sentCount = 0
  let failedCount = 0

  for (const setting of settings ?? []) {
    const windowStart = new Date(now - MAX_LEAD_AGE_HOURS * 3600000).toISOString()
    const windowEnd = new Date(now - setting.threshold_minutes * 60000).toISOString()

    const { data: hotLeads, error: leadsErr } = await admin
      .from('leads')
      .select('id, customer_name, customer_phone, service_type, ai_summary, score')
      .eq('account_id', setting.account_id)
      .eq('status', 'new')
      .eq('ai_quality', 'hot')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .limit(BATCH_LIMIT)

    if (leadsErr) {
      console.error('[lead-alerts/cron] fetch leads failed:', setting.account_id, leadsErr)
      continue
    }

    for (const lead of hotLeads ?? []) {
      const { data: existing } = await admin
        .from('lead_alerts')
        .select('id')
        .eq('lead_id', lead.id)
        .maybeSingle()
      if (existing) continue

      const name = lead.customer_name || 'A new lead'
      const summary = lead.ai_summary || lead.service_type || 'no details yet'

      try {
        await notifyOwnerTemplate({
          accountId: setting.account_id,
          to: setting.owner_whatsapp_number!,
          templateName: setting.template_name!,
          language: setting.template_language,
          params: [name, lead.customer_phone, summary],
        })

        const { error: insertErr } = await admin.from('lead_alerts').insert({
          account_id: setting.account_id,
          lead_id: lead.id,
        })
        if (insertErr) {
          // UNIQUE(lead_id) tripping here means a concurrent run
          // already recorded this alert — not a real failure.
          if (insertErr.code !== '23505') {
            console.error('[lead-alerts/cron] insert failed after send:', lead.id, insertErr)
          }
        }
        sentCount++
      } catch (sendErr) {
        console.error('[lead-alerts/cron] send failed:', lead.id, sendErr)
        failedCount++
      }
    }
  }

  return NextResponse.json({ sentCount, failedCount })
}
