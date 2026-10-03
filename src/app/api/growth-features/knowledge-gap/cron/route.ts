// ============================================================
// GET /api/growth-features/knowledge-gap/cron
//
//   Knowledge Gap Finder. In-app only — no WhatsApp, no owner alert,
//   surfaced instead on the Business Knowledge page as a dismissible
//   suggestion list. Low-urgency by design: "review when convenient,"
//   not an interrupt.
//
//   For every account with knowledge_gap_enabled, reads recent
//   customer questions (last 24h) alongside the account's existing
//   business_knowledge titles, and asks AI which questions AREN'T
//   already covered. Recurring gaps accumulate on one row per
//   question_pattern (UNIQUE(account_id, question_pattern)) —
//   occurrence_count is the signal that makes a gap worth closing
//   ("17 customers asked this").
//
//   Protect with checkCronAuth('KNOWLEDGE_GAP_CRON_SECRET').
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkCronAuth } from '@/lib/cron-auth'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

const BATCH_LIMIT = 40

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'KNOWLEDGE_GAP_CRON_SECRET')
  if (authError) return authError

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ gapsFoundCount: 0, note: 'OPENAI_API_KEY not set' })

  const admin = supabaseAdmin()
  const recentCutoff = new Date(Date.now() - 24 * 3600000).toISOString()

  const { data: settings, error: settingsErr } = await admin
    .from('growth_feature_settings')
    .select('account_id')
    .eq('knowledge_gap_enabled', true)
    .limit(50)

  if (settingsErr) console.error('[knowledge-gap/cron] fetch settings failed:', settingsErr)

  let gapsFoundCount = 0

  for (const setting of settings ?? []) {
    const { data: convos } = await admin
      .from('conversations')
      .select('id')
      .eq('account_id', setting.account_id)
      .gte('last_message_at', recentCutoff)
      .limit(BATCH_LIMIT)
    if (!convos?.length) continue

    const { data: messages } = await admin
      .from('messages')
      .select('content_text, sender_type')
      .in('conversation_id', convos.map((c) => c.id))
      .eq('sender_type', 'customer')
      .gte('created_at', recentCutoff)
      .limit(300)

    const questions = decryptMessages(messages ?? [])
      .map((m) => m.content_text)
      .filter((t): t is string => !!t && (t.trim().endsWith('?') || /\b(how|what|when|where|do you|can i|kya|kaise|kitna)\b/i.test(t)))
      .slice(0, 60)
    if (questions.length < 3) continue // not enough signal to bother an AI call over

    const { data: knowledge } = await admin.from('business_knowledge').select('title').eq('account_id', setting.account_id).limit(100)
    const knownTitles = (knowledge ?? []).map((k) => k.title).join(', ') || '(nothing saved yet)'

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `This business already has these saved knowledge topics: ${knownTitles}. Below are real customer questions from the last 24h. Group them into recurring patterns NOT already covered by the saved topics (merge near-duplicates under one short pattern name, e.g. "delivery time", "refund policy"). Ignore one-off or already-covered questions. Return strict JSON: {"gaps": [{"pattern": "short label", "quote": "one real example question, verbatim"}]} — empty array if nothing qualifies.`,
          },
          { role: 'user', content: questions.join('\n') },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      })

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      const gaps = Array.isArray(parsed.gaps) ? parsed.gaps : []

      for (const gap of gaps) {
        const pattern = typeof gap.pattern === 'string' ? gap.pattern.slice(0, 200) : null
        const quote = typeof gap.quote === 'string' ? gap.quote.slice(0, 500) : null
        if (!pattern) continue

        const { data: existing } = await admin
          .from('knowledge_gaps')
          .select('id, occurrence_count')
          .eq('account_id', setting.account_id)
          .eq('question_pattern', pattern)
          .maybeSingle()

        if (existing) {
          await admin
            .from('knowledge_gaps')
            .update({ occurrence_count: existing.occurrence_count + 1, sample_quote: quote ?? undefined, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          await admin.from('knowledge_gaps').insert({
            account_id: setting.account_id,
            question_pattern: pattern,
            sample_quote: quote,
          })
        }
        gapsFoundCount++
      }
    } catch (aiErr) {
      console.error('[knowledge-gap/cron] AI check failed:', setting.account_id, aiErr)
    }
  }

  return NextResponse.json({ gapsFoundCount })
}
