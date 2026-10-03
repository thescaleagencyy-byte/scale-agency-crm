// ============================================================
// GET /api/growth-features/upsell-detect/cron
//
//   Upsell Moment Detector. For every account with
//   upsell_detector_enabled, scans deals marked 'won' in the last 48h
//   with no existing upsell_suggestions row, reads the deal's
//   conversation for a genuine upsell/cross-sell cue the customer
//   themselves raised (not a fabricated one), and drafts a suggested
//   follow-up message.
//
//   Draft-and-approve, same spirit as `price_objection_drafts` (082)
//   and `agent_actions` (068): this NEVER messages the customer
//   directly. It only WhatsApps the draft to the OWNER via
//   `notifyOwnerTemplate`, who decides whether to send it.
//   UNIQUE(deal_id) caps it at one suggestion per won deal.
//
//   Protect with checkCronAuth('UPSELL_DETECT_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 30
const LOOKBACK_HOURS = 48

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'UPSELL_DETECT_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ draftedCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()
  const lookback = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('growth_feature_settings')
    .select('account_id, owner_whatsapp_number, template_language, upsell_detector_template')
    .eq('upsell_detector_enabled', true)
    .not('owner_whatsapp_number', 'is', null)
    .not('upsell_detector_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[upsell-detect/cron] fetch settings failed:', settingsErr)

  let draftedCount = 0

  for (const setting of settings ?? []) {
    const { data: wonDeals, error: dealsErr } = await admin
      .from('deals')
      .select('id, title, value, currency, contact_id, conversation_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'won')
      .gte('updated_at', lookback)
      .limit(BATCH_LIMIT)

    if (dealsErr) {
      console.error('[upsell-detect/cron] fetch deals failed:', setting.account_id, dealsErr)
      continue
    }

    for (const deal of wonDeals ?? []) {
      const { data: existing } = await admin.from('upsell_suggestions').select('id').eq('deal_id', deal.id).maybeSingle()
      if (existing) continue

      let conversationId = deal.conversation_id
      if (!conversationId && deal.contact_id) {
        const { data: convo } = await admin
          .from('conversations')
          .select('id')
          .eq('contact_id', deal.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        conversationId = convo?.id ?? null
      }
      if (!conversationId) continue

      const { data: messages } = await admin
        .from('messages')
        .select('sender_type, content_text')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(30)

      const transcript = decryptMessages((messages ?? []).slice().reverse())
        .filter((m) => m.content_text)
        .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text}`)
        .join('\n')
      if (!transcript.trim()) continue

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `This customer just closed a won deal ("${deal.title}", ${deal.currency} ${deal.value}). Read the conversation for a genuine upsell/cross-sell opening the CUSTOMER THEMSELVES raised or implied (asked about a related product/service, mentioned a bigger need, asked "do you also do X") — never invent one that isn't actually in the text. If found, draft a short, natural follow-up message the business could send. Return strict JSON: {"detected": true|false, "suggestion": "the exact message text to send, or empty string", "reason": "one plain-language sentence quoting what the customer said"}.`,
            },
            { role: 'user', content: transcript.slice(0, 8000) },
          ],
          temperature: 0.3,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
        if (!parsed.detected || typeof parsed.suggestion !== 'string' || !parsed.suggestion.trim()) continue

        const suggestion = parsed.suggestion.slice(0, 500)
        const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : ''

        const { data: draftRow, error: insertErr } = await admin
          .from('upsell_suggestions')
          .insert({
            account_id: setting.account_id,
            deal_id: deal.id,
            contact_id: deal.contact_id,
            suggested_upsell: suggestion,
            ai_reason: reason,
          })
          .select('id')
          .single()
        if (insertErr) {
          if (insertErr.code !== '23505') console.error('[upsell-detect/cron] insert failed:', deal.id, insertErr)
          continue
        }
        draftedCount++

        try {
          await notifyOwnerTemplate({
            accountId: setting.account_id,
            to: setting.owner_whatsapp_number,
            templateName: setting.upsell_detector_template,
            language: setting.template_language,
            params: [reason, suggestion],
          })
          await admin.from('upsell_suggestions').update({ status: 'sent_to_owner' }).eq('id', draftRow.id)
        } catch (sendErr) {
          console.error('[upsell-detect/cron] owner notify failed:', deal.id, sendErr)
        }
      } catch (aiErr) {
        console.error('[upsell-detect/cron] AI check failed:', deal.id, aiErr)
      }
    }
  }

  return NextResponse.json({ draftedCount })
}
