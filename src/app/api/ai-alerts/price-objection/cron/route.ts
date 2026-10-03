// ============================================================
// GET /api/ai-alerts/price-objection/cron
//
//   Silent Price-Objection Catch. Customers rarely say "too
//   expensive" outright — they go quiet, say "I'll think about it",
//   or stall. For every account with price_objection_enabled, scans
//   OPEN conversations with a recent customer message, has AI read
//   the tail of the thread for that soft-decline pattern, and if
//   found, drafts a recovery offer (discount or payment-plan phrasing,
//   capped at price_objection_discount_cap — the AI is never free to
//   suggest more than the owner allowed).
//
//   Draft-and-approve, same spirit as `agent_actions`
//   (068_agent_actions.sql): this NEVER sends anything to the
//   customer. It only WhatsApps the draft to the OWNER, who decides
//   whether to use it. UNIQUE(conversation_id) caps it at one draft
//   per conversation.
//
//   Protect with checkCronAuth('PRICE_OBJECTION_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { notifyOwnerTemplate } from '@/lib/automations/notify-owner'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 30

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'PRICE_OBJECTION_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ checkedCount: 0, draftedCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()
  const recentCutoff = new Date(Date.now() - 6 * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('ai_alert_settings')
    .select('account_id, owner_whatsapp_number, template_language, price_objection_template, price_objection_discount_cap')
    .eq('price_objection_enabled', true)
    .not('owner_whatsapp_number', 'is', null)
    .not('price_objection_template', 'is', null)
    .limit(50)

  if (settingsErr) console.error('[price-objection/cron] fetch settings failed:', settingsErr)

  let checkedCount = 0
  let draftedCount = 0

  for (const setting of settings ?? []) {
    const { data: candidates, error: convErr } = await admin
      .from('conversations')
      .select('id, contact_id')
      .eq('account_id', setting.account_id)
      .eq('status', 'open')
      .gte('last_message_at', recentCutoff)
      .limit(BATCH_LIMIT)

    if (convErr) {
      console.error('[price-objection/cron] fetch conversations failed:', setting.account_id, convErr)
      continue
    }

    for (const convo of candidates ?? []) {
      const { data: existing } = await admin
        .from('price_objection_drafts')
        .select('id')
        .eq('conversation_id', convo.id)
        .maybeSingle()
      if (existing) continue

      const { data: messages } = await admin
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', convo.id)
        .order('created_at', { ascending: false })
        .limit(20)

      const transcript = decryptMessages((messages ?? []).slice().reverse())
        .filter((m) => m.content_text)
        .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text}`)
        .join('\n')
      if (!transcript.trim()) continue

      checkedCount++

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Read this WhatsApp sales conversation. Judge whether the customer is softly declining on PRICE without saying so directly — going quiet after a price was mentioned, "I'll think about it", "let me check and get back", stalling, or asking "any discount?" without committing. If so, draft a short, natural recovery message the business could send (a discount of AT MOST ${setting.price_objection_discount_cap}% OR a payment-plan phrasing — whichever fits the conversation better), written in the same language/tone the customer's been using. Return strict JSON: {"detected": true|false, "offer": "the exact message text to send, or empty string if not detected", "reason": "one plain-language sentence explaining what signal you saw"}.`,
            },
            { role: 'user', content: transcript.slice(0, 8000) },
          ],
          temperature: 0.3,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
        if (!parsed.detected || typeof parsed.offer !== 'string' || !parsed.offer.trim()) continue

        const offer = parsed.offer.slice(0, 500)
        const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : ''

        const { data: draftRow, error: insertErr } = await admin
          .from('price_objection_drafts')
          .insert({
            account_id: setting.account_id,
            conversation_id: convo.id,
            contact_id: convo.contact_id,
            suggested_offer: offer,
            ai_reason: reason,
          })
          .select('id')
          .single()

        if (insertErr) {
          console.error('[price-objection/cron] insert failed:', convo.id, insertErr)
          continue
        }
        draftedCount++

        // Informational only — goes to the OWNER, never the customer.
        // Still needs an approved template: Meta's 24h free-form rule
        // applies to any business-initiated message regardless of who
        // the recipient is, so this follows the same template-only
        // path as every other owner alert in this app.
        try {
          await notifyOwnerTemplate({
            accountId: setting.account_id,
            to: setting.owner_whatsapp_number,
            templateName: setting.price_objection_template,
            language: setting.template_language,
            params: [reason, offer],
          })
          await admin.from('price_objection_drafts').update({ status: 'sent_to_owner' }).eq('id', draftRow.id)
        } catch (sendErr) {
          console.error('[price-objection/cron] owner notify failed:', convo.id, sendErr)
        }
      } catch (aiErr) {
        console.error('[price-objection/cron] AI check failed:', convo.id, aiErr)
      }
    }
  }

  return NextResponse.json({ checkedCount, draftedCount })
}
