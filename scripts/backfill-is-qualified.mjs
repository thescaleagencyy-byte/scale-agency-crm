// One-time backfill: scans every conversation's full message history
// and sets conversations.is_qualified = true wherever a bot/agent
// question was followed by a substantive customer reply — same rule
// applied going forward by src/lib/inbox/qualified-reply.ts. Run once
// after migration 077 lands.
//
// Usage: node --env-file=.env.local scripts/backfill-is-qualified.mjs
// (run from the repo root, so @supabase/supabase-js resolves and
// .env.local's NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// MESSAGE_ENCRYPTION_KEY are picked up)

import { createClient } from '@supabase/supabase-js'
import { decryptContent } from '../src/lib/crypto.ts'
import { detectsQualifyingReply } from '../src/lib/inbox/qualified-reply.ts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// Keyset pagination on id, not offset/range — this loop updates rows
// to is_qualified=true as it goes, so filtering on is_qualified=false
// with an offset would drift (the result set shrinks underneath the
// offset as rows flip, silently skipping conversations). Ordering by
// id and paging with `id > lastSeenId` stays correct regardless.
const PAGE_SIZE = 500
let lastSeenId = null
let scanned = 0
let qualified = 0

while (true) {
  let query = supabase
    .from('conversations')
    .select('id')
    .order('id', { ascending: true })
    .limit(PAGE_SIZE)
  if (lastSeenId) query = query.gt('id', lastSeenId)

  const { data: conversations, error } = await query

  if (error) {
    console.error('Failed to page conversations:', error)
    process.exit(1)
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
        console.error(`Failed to update conversation ${conv.id}:`, updateErr)
      } else {
        qualified++
      }
    }
  }
}

console.log(`Scanned ${scanned} conversations, marked ${qualified} as qualified.`)
