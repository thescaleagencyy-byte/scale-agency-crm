// ============================================================
// GET /api/ai-alerts/dialect-detect/cron
//
//   Passive metadata only — detects the language/dialect a contact
//   actually writes in (Urdu, Arabic, Punjabi, mixed-script, broken
//   English, etc) from their recent messages and stores it on
//   `contacts.detected_language`. Shown as a small badge in the inbox
//   for the human agent to see at a glance — deliberately does NOT
//   draft or send anything. Umer removed AI-drafted inbox replies on
//   2026-08-16 ("Umer's call", commit adcf095); this stays strictly
//   informational so it doesn't cross that line.
//
//   Protect with checkCronAuth('DIALECT_DETECT_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 40

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'DIALECT_DETECT_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ detectedCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()

  const { data: settings, error: settingsErr } = await admin
    .from('ai_alert_settings')
    .select('account_id')
    .eq('dialect_detection_enabled', true)
    .limit(50)

  if (settingsErr) console.error('[dialect-detect/cron] fetch settings failed:', settingsErr)

  let detectedCount = 0

  for (const setting of settings ?? []) {
    const { data: contacts, error: contactErr } = await admin
      .from('contacts')
      .select('id')
      .eq('account_id', setting.account_id)
      .is('detected_language', null)
      .limit(BATCH_LIMIT)

    if (contactErr) {
      console.error('[dialect-detect/cron] fetch contacts failed:', setting.account_id, contactErr)
      continue
    }

    for (const contact of contacts ?? []) {
      const { data: conversation } = await admin
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!conversation) continue

      const { data: messages } = await admin
        .from('messages')
        .select('sender_type, content_text')
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false })
        .limit(10)

      const texts = decryptMessages(messages ?? [])
        .map((m) => m.content_text)
        .filter((t): t is string => !!t && t.trim().length > 0)
      if (texts.length < 2) continue // not enough signal yet

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Identify the language/dialect these WhatsApp messages are written in, as a short label a business owner would recognize (e.g. "Urdu", "Roman Urdu", "Arabic", "Gulf Arabic", "Punjabi", "English", "Mixed English/Urdu"). Return strict JSON: {"language": "short label"}.',
            },
            { role: 'user', content: texts.join('\n') },
          ],
          temperature: 0,
          max_tokens: 50,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
        const language = typeof parsed.language === 'string' ? parsed.language.slice(0, 50) : null
        if (!language) continue

        const { error: updateErr } = await admin.from('contacts').update({ detected_language: language }).eq('id', contact.id)
        if (!updateErr) detectedCount++
      } catch (aiErr) {
        console.error('[dialect-detect/cron] AI detection failed:', contact.id, aiErr)
      }
    }
  }

  return NextResponse.json({ detectedCount })
}
