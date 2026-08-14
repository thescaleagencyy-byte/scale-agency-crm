import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { decryptContent } from '@/lib/crypto'
import { detectsQualifyingReply } from '@/lib/inbox/qualified-reply'

/**
 * POST /api/admin/backfill-is-qualified
 *
 * One-time (re-runnable, idempotent) job: scans the caller's own
 * account's full conversation history and sets is_qualified=true
 * wherever a bot/agent question was followed by a substantive
 * customer reply — same rule applied going forward on every new
 * inbound message (see lib/inbox/qualified-reply.ts).
 *
 * Runs server-side specifically so it can read MESSAGE_ENCRYPTION_KEY
 * from the deployed runtime — that key is a Vercel "Sensitive" env
 * var, which by design is write-only and can never be pulled back out
 * via the CLI, so an external script can't decrypt real message
 * content to backfill correctly.
 *
 * Owner-only, RLS-scoped (not service-role) — same safety pattern as
 * every other write path: a call here can't touch another account's
 * rows.
 */
export async function POST() {
  try {
    const { supabase, accountId } = await requireRole('owner')

    let lastSeenId: string | null = null
    let scanned = 0
    let qualified = 0

    while (true) {
      let query = supabase
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .order('id', { ascending: true })
        .limit(500)
      if (lastSeenId) query = query.gt('id', lastSeenId)

      const { data: conversations, error } = await query
      if (error) {
        console.error('[admin/backfill-is-qualified] page fetch failed:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!conversations || conversations.length === 0) break
      lastSeenId = conversations[conversations.length - 1].id

      for (const conv of conversations) {
        scanned++
        const { data: messages } = await supabase
          .from('messages')
          .select('sender_type, content_type, content_text')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true })

        if (!messages || messages.length < 2) continue

        let becomesQualified = false
        for (let i = 1; i < messages.length; i++) {
          const preceding = messages[i - 1]
          const current = messages[i]
          if (current.sender_type !== 'customer') continue
          const qualifies = detectsQualifyingReply({
            precedingMessage: {
              sender_type: preceding.sender_type,
              content_text: decryptContent(preceding.content_text),
            },
            newMessage: {
              content_type: current.content_type,
              content_text: decryptContent(current.content_text),
            },
          })
          if (qualifies) {
            becomesQualified = true
            break
          }
        }

        if (becomesQualified) {
          const { error: updateErr } = await supabase
            .from('conversations')
            .update({ is_qualified: true })
            .eq('id', conv.id)
          if (updateErr) {
            console.error(`[admin/backfill-is-qualified] update failed for ${conv.id}:`, updateErr)
          } else {
            qualified++
          }
        }
      }
    }

    return NextResponse.json({ scanned, qualified })
  } catch (err) {
    return toErrorResponse(err)
  }
}
