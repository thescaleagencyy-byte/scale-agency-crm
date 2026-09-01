# Qualified-lead signal + real-time alert for the inbox

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

Two related problems, one spec:

1. When Umer opens the inbox, he should be able to tell at a glance
   which conversations involved a customer actually answering the
   bot's qualifying questions, versus conversations that never went
   past noise.
2. He shouldn't have to remember to open the inbox to find out. A live
   audit this session found 84% of leads (37 of 44, last 30 days) never
   got a human reply, and 15 escalated conversations sat unanswered for
   up to 29 hours — not a code bug, a visibility gap. Nothing tells
   Umer the moment a real lead needs him. He's three days into running
   paid ads with a near-zero close rate, and unattended leads going
   cold is a direct, current cause.

## Non-goals

- Not replacing or modifying `is_lead` or anything `rollup.ts` reads.
- Not an LLM judgment call for qualification — Umer explicitly wants
  deterministic, rule-based detection (consistent with the earlier
  correction on Predictive Intelligence: "calculations based on
  available data, not live AI").
- Qualification detection itself doesn't reach into the n8n workflow —
  it works from message content already stored in this app's database.
  The alert (below) does call out to n8n, since that's where the
  WhatsApp-send credentials for notifying Umer already live.
- Not building a second n8n workflow for the alert — reusing the
  existing "Scale Agency CRM — Upgrade Request Alert" workflow
  (`C6BxxV7gQvHQhnrH`), which already has the exact webhook-in →
  WhatsApp-out shape needed, just for a second event type.
- Not fixing the underlying blocker that alert depends on: that
  workflow's `Format Alert` node still has a placeholder admin number
  (`923000000000`) and its `Send via WhatsApp API` node has no real
  `phone_number_id`/credential attached — both flagged earlier this
  session, still unresolved. The alert code ships either way; it
  simply won't deliver until Umer fills those in himself (same
  standing workflow as every other n8n config change — this app
  doesn't have write access to attach Umer's own WhatsApp credential).

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
preceding a new inbound customer message (by `created_at`) was sent by
the bot/agent AND its text, right-trimmed of whitespace, ends in `?`,
AND the new customer message passes `isSubstantiveReply`. This is intentionally script-agnostic — it does
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

## Real-time alert

Reuses the exact fire-and-forget webhook pattern already shipped in
`src/app/api/billing/request-upgrade/route.ts`: `fetch()` to
`N8N_UPGRADE_WEBHOOK_URL` with an `x-webhook-secret` header, wrapped so
a webhook failure never blocks or fails the request that triggered it.
No new env vars — same URL/secret already configured, since this
extends the same n8n workflow rather than standing up a second one.

New shared helper, `src/lib/alerts/lead-alert.ts`:

```ts
export function triggerLeadAlert(event: {
  type: 'qualified' | 'escalated'
  accountName: string
  contactName: string
  contactPhone: string
  conversationId: string
}): void
```

Fire-and-forget, same as the upgrade-request alert — logs and swallows
on failure, never throws into the caller.

Called from both message-insert call sites, immediately after an
`is_qualified` or `is_escalated` flip from `false` to `true` (only on
the actual transition, not every message after — otherwise a long
escalated conversation would re-alert on every new inbound message).

Payload gets a new `eventType` field (`'qualified_lead' |
'escalation'`, alongside the upgrade-request alert's existing implicit
type) so the n8n workflow's `Format Alert` code node can branch to a
different WhatsApp message per event type. **That branching logic is
an n8n-side change**, not something this app's code touches — out of
scope for the implementation plan unless Umer explicitly asks for it
to be made via the n8n-mcp tools (editing a live, active production
workflow needs his confirmation first, same as any other production
automation change).

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
- Manual: confirm `triggerLeadAlert` fires exactly once per
  conversation per event type (not on every subsequent message), and
  that a webhook failure (e.g. env vars unset) doesn't throw or block
  the underlying message insert.
