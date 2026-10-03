// ============================================================
// GET /api/growth-features/referral-detect/cron
//
//   Referral Auto-Detection. For every account with
//   referral_detection_enabled, scans NEW contacts (created in the
//   last 7 days, not yet checked) for referral language in their
//   first messages ("X told me about you", "recommended by Y") and,
//   if a name/phone is mentioned, tries an EXACT deterministic match
//   against this account's own contacts — same "refuse ambiguous
//   matches rather than guess" rule as the Copilot's tools (see
//   /api/ai/assistant). AI only extracts what was said; it never
//   picks which contact_id is correct — that's a real database
//   lookup, 0 or 1 result or skip.
//
//   WhatsApps the owner so a referral (and the word-of-mouth it
//   represents) doesn't go unnoticed and unrewarded.
//
//   Protect with checkCronAuth('REFERRAL_DETECT_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 40

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'REFERRAL_DETECT_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ detectedCount: 0, alertedCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()
  const recentCutoff = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('growth_feature_settings')
    .select('account_id, owner_whatsapp_number, template_language, referral_alert_template')
    .eq('referral_detection_enabled', true)
    .not('owner_whatsapp_number', 'is', null)
    .not('referral_alert_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[referral-detect/cron] fetch settings failed:', settingsErr)

  let detectedCount = 0
  let alertedCount = 0

  for (const setting of settings ?? []) {
    const { data: newContacts, error: contactErr } = await admin
      .from('contacts')
      .select('id, name')
      .eq('account_id', setting.account_id)
      .is('referred_by_contact_id', null)
      .gte('created_at', recentCutoff)
      .limit(BATCH_LIMIT)

    if (contactErr) {
      console.error('[referral-detect/cron] fetch contacts failed:', setting.account_id, contactErr)
      continue
    }

    for (const contact of newContacts ?? []) {
      const { data: existingAlert } = await admin
        .from('referral_alerts')
        .select('id')
        .eq('contact_id', contact.id)
        .maybeSingle()
      if (existingAlert) continue

      const { data: conversation } = await admin
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!conversation) continue

      const { data: messages } = await admin
        .from('messages')
        .select('sender_type, content_text')
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: true })
        .limit(5)

      const firstTexts = decryptMessages(messages ?? [])
        .map((m) => m.content_text)
        .filter((t): t is string => !!t)
      if (!firstTexts.length) continue

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Read these first messages from a new customer. Did they mention being referred by someone (an existing customer, friend, or contact — "X told me", "recommended by Y", "my friend said to message you")? If so, extract the name or phone number they mentioned. Return strict JSON: {"referred": true|false, "referrer_name_or_phone": "exactly what they wrote, or empty string"}.',
            },
            { role: 'user', content: firstTexts.join('\n') },
          ],
          temperature: 0,
          max_tokens: 100,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
        if (!parsed.referred || typeof parsed.referrer_name_or_phone !== 'string' || !parsed.referrer_name_or_phone.trim()) continue

        const mention = parsed.referrer_name_or_phone.trim()

        // Deterministic lookup, not an AI guess — exact match only,
        // refuse if ambiguous (more than one hit) or not found.
        const { data: matches } = await admin
          .from('contacts')
          .select('id, name')
          .eq('account_id', setting.account_id)
          .neq('id', contact.id)
          .or(`name.ilike.%${mention}%,phone.ilike.%${mention}%`)
          .limit(2)

        if (!matches || matches.length !== 1) continue
        const referrer = matches[0]

        await admin.from('contacts').update({ referred_by_contact_id: referrer.id }).eq('id', contact.id)
        detectedCount++

        await admin.from('referral_alerts').insert({ account_id: setting.account_id, contact_id: contact.id })

        try {
          await notifyOwnerTemplate({
            accountId: setting.account_id,
            to: setting.owner_whatsapp_number,
            templateName: setting.referral_alert_template,
            language: setting.template_language,
            params: [referrer.name ?? 'A customer', contact.name ?? 'a new customer'],
          })
          alertedCount++
        } catch (sendErr) {
          console.error('[referral-detect/cron] owner alert failed:', contact.id, sendErr)
        }
      } catch (aiErr) {
        console.error('[referral-detect/cron] AI check failed:', contact.id, aiErr)
      }
    }
  }

  return NextResponse.json({ detectedCount, alertedCount })
}
