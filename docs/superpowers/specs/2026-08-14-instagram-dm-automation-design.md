# Instagram DM automation

## Problem

Umer wants Instagram DMs to your business account (@scaleagencyai / "Scale
AI" Page, id `1112429075279428`) handled the same way WhatsApp messages
already are: the same qualifying-question bot flow, landing in the same
Scale OS inbox, getting the same `is_qualified`/`is_escalated` treatment
shipped earlier this session — not a second, separate system.

Instagram is already "Connected" in the Integration Hub, but that's just a
verified access token for API calls (e.g. future content publishing) — it
has nothing to do with receiving or automating inbound DMs, which is a
separate build.

## External dependency — checked, not a blocker

Instagram DM automation for a business's own connected account needs the
`instagram_manage_messages` / `instagram_business_manage_messages`
permissions. Checked Meta's own Permissions & Features panel for "The
Scale Agency" app directly: **Standard access has no requirement** and is
already auto-granted. Advanced Access (Business Verification + App
Review) is only needed to manage messages on *other* businesses' accounts
at scale — not relevant here, since this is Scale Agency's own account.
No Meta review wait, no external blocker.

## Architecture decision

Extends the existing live n8n workflow ("SA (staging)", id
`ROnd2fMoyesHSD14`, 121 nodes, the real WhatsApp bot despite its name)
rather than building a parallel bot engine natively in this repo. Faster
to ship, reuses the qualifying-question script, the lead-storage Data
Tables, and the lock/dedupe pattern already proven live for WhatsApp.
Tradeoff accepted: every change touches a live production workflow, same
caution as every other n8n edit this session (surgical, reviewed before
applying).

## Data model

Two changes to `contacts`, one new column:

- `contacts.phone` becomes nullable (currently `NOT NULL`) — an
  Instagram-only contact has no phone number at all.
- New `contacts.instagram_id text` — Meta's Instagram-Scoped ID (IGSID),
  nullable. Unlike phone (fuzzy-matched on normalized last-8-digit
  suffix, see `findExistingContact`), IGSID matching is an exact string
  match — no normalization needed.
- New `contacts.channel text not null default 'whatsapp' check (channel
  in ('whatsapp', 'instagram'))`.
- Partial unique index on `(account_id, instagram_id) where instagram_id
  is not null`, mirroring the existing phone-dedup approach from
  migration 022.

Same one-contact-one-conversation model as today stays unchanged — an
Instagram sender becomes a new contact row (channel='instagram',
phone=null, instagram_id=set), with its own conversation, exactly
parallel to how a new WhatsApp number works. **Not in scope**: merging a
contact across both channels if the same real person messages on both —
there's no reliable shared identifier between a phone number and an
IGSID to merge on.

## Ingestion

`/api/n8n/log` gets two new optional fields: `channel` (defaults to
`'whatsapp'`, so every existing caller keeps working unchanged) and
`instagram_id` (used in place of `phone_number` when `channel ===
'instagram'` — `phone_number` becomes conditionally required based on
channel rather than always-required).

Contact resolution branches on channel: `channel === 'instagram'` looks
up by exact `(account_id, instagram_id)` match instead of calling
`findExistingContact` (which is phone-normalization-specific and doesn't
apply here).

Everything downstream of contact/conversation resolution — message
insert, the content-based idempotency guard shipped earlier this session,
the `is_qualified`/`is_escalated` detection and real-time alert — is
already channel-agnostic and needs no changes, since it operates on
stored message content and sender_type, not on how the contact was
identified.

n8n side: "SA (staging)" gets a second trigger node (Instagram messaging
webhook) feeding into the same downstream flow. The "Extract Message"
code node needs a branch to normalize Instagram's webhook payload shape
(different from WhatsApp's `entry[].changes[].value.messages[]` shape)
into the same intermediate `{message_id, from, type, text, contact_name,
...}` object the rest of the workflow already consumes — the qualifying
script, lock, and dedupe nodes don't need to know which channel a message
came from.

## Outbound (v1 scope — human replies included)

Two send paths, both new:

1. **Bot replies** — a parallel "Send Instagram Message" node in n8n,
   calling Instagram's Graph API (`POST /{ig-id}/messages`) with the
   already-connected Page access token, alongside the existing "Send
   WhatsApp Message" node.
2. **Human replies on an escalated conversation** — the Scale OS inbox
   composer needs to route to the right API based on
   `conversation.channel` (via the contact's channel). New send route
   (mirrors `/api/whatsapp/send`'s shape) for the Instagram case, wired
   into the same composer component so replying doesn't depend on which
   channel the conversation came in on.

Included in v1 deliberately: an escalation nobody can reply to is a dead
end, and this session's audit already found WhatsApp escalations sitting
unanswered for up to 29 hours — shipping a second channel with the same
gap would repeat a known problem, not fix anything.

## UI

Conversation list gets a small channel indicator (WhatsApp vs Instagram
icon) per row, next to the existing Qualified/Lead/Escalated badges — no
other inbox structure changes, since the list, filters, and detail view
are already channel-agnostic.

## Non-goals

- Cross-channel contact merging (see Data model above).
- Any change to the Instagram integration's existing token/verification
  flow in the Integration Hub — that stays as-is.
- Content publishing via the Instagram connection — out of scope, this
  spec is DM automation only.
- Advanced Access / Business Verification — not needed for this scope,
  would only become relevant if Scale Agency later wanted this same app
  to automate messages for client Instagram accounts too.

## Testing

- Unit: contact-resolution branch (instagram_id exact match vs phone
  fuzzy match) in isolation, same style as `qualified-reply.test.ts`.
- Manual: send a real test DM to @scaleagencyai, confirm it lands in the
  Scale OS inbox with the right channel badge, confirm a qualifying
  exchange flips `is_qualified` the same way a WhatsApp one does, confirm
  a human reply from the composer on an escalated IG conversation
  actually delivers.
