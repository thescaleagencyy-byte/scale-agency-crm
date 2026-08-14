# Qualified-lead signal for the inbox

## Problem

The inbox currently has no reliable way to tell a real business lead
apart from someone who sent an emoji, a sticker, or a bare voice note
and never engaged further. The existing `is_lead` flag looks like it
should answer this, but it's set by the external n8n bot flow calling
`/api/n8n/log` with `is_lead: true` — that judgment lives inside n8n,
not in this app, and it's already proven too loose: a live audit this
session found conversations marked `is_lead: true` whose entire
customer-side content was a single emoji ("🥂") or an unlabeled voice
note.

`is_lead` also isn't safe to redefine — `src/lib/meta-ads/rollup.ts`
uses it to compute qualified-lead counts for ad ROI reporting.
Changing its meaning would shift those numbers as a side effect of an
unrelated inbox-display fix.

## Goal

When Umer opens the inbox, he should be able to tell at a glance which
conversations involved a customer actually answering the bot's
qualifying questions, versus conversations that never went past noise.

## Non-goals

- Not replacing or modifying `is_lead` or anything `rollup.ts` reads.
- Not an LLM judgment call — Umer explicitly wants deterministic,
  rule-based detection (consistent with the earlier correction on
  Predictive Intelligence: "calculations based on available data, not
  live AI").
- Not reaching into the n8n workflow itself — detection works from
  message content already stored in this app's database.

## Data model

New column: `conversations.is_qualified boolean not null default false`.

One-way flag, same convention as `is_lead` / `is_escalated`: flips to
`true` once qualifying evidence is seen, never automatically reset.

## Detection logic

New shared helper, `src/lib/inbox/qualified-reply.ts`:

```ts
export function isSubstantiveReply(message: { content_type: string; content_text: string | null }): boolean
```

Returns `true` only if:
- `content_type` is `'text'` or `'interactive'` (button/list tap) — a
  voice note, image, sticker, or document never counts, regardless of
  any caption, matching Umer's own example of "wasting time" (a bare
  voice note with no real content).
- The text, with emoji and surrounding whitespace stripped, has at
  least one real word character (Unicode letter — supports Urdu/Arabic
  script customers already seen in this inbox, not just Latin) and a
  stripped length of 2 or more characters.

A conversation becomes qualified when: the message immediately
preceding a new inbound customer message was sent by the bot/agent AND
its text ends in `?`, AND the new customer message passes
`isSubstantiveReply`. This is intentionally script-agnostic — it does
not hardcode Scale Agency's current qualifying questions ("what's your
business called", "which best describes your business"), so it keeps
working if the bot script changes later, at the cost of being slightly
less precise than hardcoding today's exact script.

## Where it's wired in

Both paths that insert an inbound customer message call the same
helper immediately after insert, so the two bot-routing paths (native
Meta webhook and n8n-routed) can't drift into different qualification
behavior:

- `src/app/api/whatsapp/webhook/route.ts` — `processMessage()`, right
  after the existing `has_customer_replied` stamping logic.
- `src/app/api/n8n/log/route.ts` — same point, after its own message
  insert.

Each call site: fetch the immediately-prior message in the
conversation (already have `conversation.id` in scope in both files),
check sender is bot/agent and text ends in `?`, run
`isSubstantiveReply` on the new customer message, and if both hold,
update `conversations.is_qualified = true` (skip the update entirely
if already `true`, same pattern already used for `is_lead`/
`is_escalated`).

## Backfill

One-time script/migration scans all conversations' existing message
history (not just the last 30 days audited this session — full
history, since the cost is a single pass) applying the same
`isSubstantiveReply` + preceding-bot-question check across each
conversation's message sequence in order, setting `is_qualified = true`
wherever the pattern is found. Read-only against message content,
single UPDATE per newly-qualified conversation.

## UI

`src/components/inbox/conversation-list.tsx`:
- New "✓ Qualified" badge/pill on each conversation row, visually
  distinct from the existing Lead pill (different color) so the two
  signals aren't confused with each other.
- New filter tab "Qualified" alongside the existing Leads / Escalations
  filter tabs, filtering on `is_qualified = true`.
- Existing "Leads" filter tab is untouched — stays wired to `is_lead`.

## Testing

- Unit-level: `isSubstantiveReply` against representative inputs —
  plain text answer, emoji-only, single punctuation, sticker,
  voice-note with no caption, short Urdu-script answer, button/list
  interactive reply.
- Manual: after backfill, spot-check a handful of the conversations
  flagged in this session's audit (e.g. the "🥂" and bare voice-note
  ones) to confirm they stay unqualified, and a couple of the ones
  that answered "what's your business called?" with a real name come
  back qualified.
