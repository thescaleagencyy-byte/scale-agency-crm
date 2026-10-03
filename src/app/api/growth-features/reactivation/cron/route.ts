// ============================================================
// GET /api/growth-features/reactivation/cron
//
//   Dead Lead Reactivation. For every account with
//   reactivation_enabled, finds leads marked 'lost' and untouched for
//   reactivation_min_days+ with no existing reactivation_attempts row,
//   and sends ONE re-engagement template, ever, via engineSendTemplate
//   (customer-facing — same tenancy boundary as review-request/cron).
//   UNIQUE(lead_id) is the one-shot guarantee.
//
//   Protect with checkCronAuth('REACTIVATION_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { checkCronAuth } from '@/lib/cron-auth'

const BATCH_LIMIT = 50

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'REACTIVATION_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()

  const { data: settings, error: settingsErr } = await admin
    .from('growth_feature_settings')
    .select('account_id, template_language, reactivation_template, reactivation_min_days')
    .eq('reactivation_enabled', true)
    .not('reactivation_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[reactivation/cron] fetch settings failed:', settingsErr)

  let sentCount = 0

  for (const setting of settings ?? []) {
    const cutoff = new Date(Date.now() - setting.reactivation_min_days * 86400000).toISOString()

    const { data: deadLeads, error: leadsErr } = await admin
      .from('leads')
      .select('id, contact_id, conversation_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'lost')
      .lte('updated_at', cutoff)
      .limit(BATCH_LIMIT)

    if (leadsErr) {
      console.error('[reactivation/cron] fetch leads failed:', setting.account_id, leadsErr)
      continue
    }

    for (const lead of deadLeads ?? []) {
      if (!lead.contact_id) continue

      const { data: existing } = await admin
        .from('reactivation_attempts')
        .select('id')
        .eq('lead_id', lead.id)
        .maybeSingle()
      if (existing) continue

      let conversationId = lead.conversation_id
      let userId: string | null = null
      if (conversationId) {
        const { data: convo } = await admin.from('conversations').select('user_id').eq('id', conversationId).maybeSingle()
        userId = convo?.user_id ?? null
      }
      if (!conversationId || !userId) {
        const { data: convo } = await admin
          .from('conversations')
          .select('id, user_id')
          .eq('contact_id', lead.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!convo) continue
        conversationId = convo.id
        userId = convo.user_id
      }
      if (!conversationId || !userId) continue

      const { error: insertErr } = await admin.from('reactivation_attempts').insert({ account_id: setting.account_id, lead_id: lead.id })
      if (insertErr) {
        if (insertErr.code !== '23505') console.error('[reactivation/cron] insert failed:', lead.id, insertErr)
        continue
      }

      try {
        await engineSendTemplate({
          accountId: setting.account_id,
          userId,
          conversationId,
          contactId: lead.contact_id,
          templateName: setting.reactivation_template!,
          language: setting.template_language,
        })
        sentCount++
      } catch (sendErr) {
        console.error('[reactivation/cron] send failed:', lead.id, sendErr)
      }
    }
  }

  return NextResponse.json({ sentCount })
}
