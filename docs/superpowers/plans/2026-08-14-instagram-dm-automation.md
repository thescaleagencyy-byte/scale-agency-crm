# Instagram DM Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instagram DMs to Scale Agency's own @scaleagencyai Page get the same bot-flow automation, inbox visibility, and qualified-lead detection that WhatsApp already has.

**Architecture:** Extends the live n8n workflow "SA (staging)" (id `ROnd2fMoyesHSD14`) with a generic Webhook-node Instagram receiver feeding the same qualifying-script/lock/dedupe logic already proven for WhatsApp, plus a parallel `httpRequest` send node. App-side: `contacts` gains a channel-agnostic identity model (nullable `phone`, new `instagram_id`, new `channel`), `/api/n8n/log` and `/api/whatsapp/send` branch on channel, everything else (qualification detection, alerts, inbox list) is already channel-agnostic and needs no changes.

**Tech Stack:** Next.js API routes, Supabase/Postgres, n8n (generic HTTP/Webhook nodes only — no community node packages), Instagram Graph API (Meta), Vitest.

## Global Constraints

- No DB CLI/password access — every migration is a numbered `.sql` file under `supabase/migrations/`, applied by Umer pasting into the Supabase SQL Editor. Nothing that reads/writes a new column ships before the migration is confirmed applied.
- `npx tsc --noEmit` must stay clean after every task. `npx eslint <changed files>` must introduce no new errors/warnings beyond the two pre-existing ones already known in `webhook/route.ts` (`downloadMedia`, `userId` unused).
- `npx vitest run` must stay green (445 passing as of this session) after every task that touches testable logic.
- n8n edits use `n8n_update_partial_workflow` (`updateNode`/`addNode` operations, `updates` as a dotted-path object) after inspecting current state with `n8n_get_workflow` (`mode: filtered`, by `nodeNames`). Each n8n-side change is its own task, never bundled silently into a code task — this is live production automation.
- Push directly to `main` with Umer's real-time approval per task, matching this session's established cadence. No new branch/PR workflow.
- Scope is Scale Agency's own @scaleagencyai Page (id `1112429075279428`) only — never a client's Instagram asset.

---

### Task 1: Schema migration — channel-agnostic contact identity

**Files:**
- Create: `supabase/migrations/078_contacts_instagram_channel.sql`
- Modify: `src/types/index.ts` (Contact interface)

**Interfaces:**
- Produces: `contacts.channel` (`'whatsapp' | 'instagram'`, default `'whatsapp'`), `contacts.instagram_id` (nullable text), `contacts.phone` now nullable. Partial unique index `(account_id, instagram_id) where instagram_id is not null`.

- [ ] **Step 1: Write the migration**

```sql
-- 078_contacts_instagram_channel.sql
-- Instagram DMs have no phone number — Meta identifies a sender by an
-- Instagram-Scoped ID (IGSID), a numeric string that's only valid
-- within this one Page's messaging context and is NOT a phone number.
-- Writing an IGSID into `phone` would corrupt phone-based dedup
-- (findExistingContact matches on last-8-digit suffix — real
-- collisions against real phone numbers would follow). This adds a
-- second, exact-match identity column instead of overloading `phone`.
--
-- Same one-contact-one-conversation model as today: an Instagram
-- sender becomes a new contact row (channel='instagram', phone=null,
-- instagram_id=set), parallel to how a new WhatsApp number works.
-- No cross-channel contact merging — there's no reliable shared
-- identifier between a phone number and an IGSID to merge on.

alter table contacts alter column phone drop not null;

alter table contacts
  add column if not exists instagram_id text,
  add column if not exists channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'instagram'));

create unique index if not exists idx_contacts_instagram_id
  on contacts (account_id, instagram_id)
  where instagram_id is not null;
```

- [ ] **Step 2: Send this file's contents to Umer to paste into the Supabase SQL Editor.** Wait for his confirmation it ran successfully before starting Task 2 — every later task assumes these columns exist.

- [ ] **Step 3: Add the two new fields to the `Contact` type**

Find the `Contact` interface in `src/types/index.ts` (check the exact current shape before editing, since other fields may have shifted). Add `instagram_id` and `channel` — **leave `phone` as `string` for now, do not change it to nullable here.** The DB column is nullable as of this migration, but no code path creates a null-phone contact until Task 5, and changing this shared type now would break every existing WhatsApp call site that correctly treats `phone` as always-present today — that cleanup belongs in the task that actually introduces null-phone contacts, not this one, so every task stays independently tsc-clean (Global Constraints).

```ts
export interface Contact {
  id: string;
  account_id: string;
  user_id: string;
  phone: string;
  name: string;
  /** Meta's Instagram-Scoped ID — set only when channel === 'instagram'. Exact-match identity, no normalization (unlike phone). Null for every WhatsApp contact. */
  instagram_id: string | null;
  /** Defaults to 'whatsapp' for every existing row (DB default). */
  channel: 'whatsapp' | 'instagram';
  // ...existing fields below, unchanged
}
```

Read the file first to see the exact existing shape and merge these fields in without disturbing the rest — don't guess at fields you haven't read.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit`

Expected: clean. This task only adds new fields — nothing existing changes type, so nothing should break.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/078_contacts_instagram_channel.sql src/types/index.ts
git commit -m "Add channel-agnostic contact identity (nullable phone, instagram_id, channel)"
git push origin main
```

---

### Task 2: Instagram contact lookup helper

**Files:**
- Create: `src/lib/contacts/instagram-dedupe.ts`
- Test: `src/lib/contacts/instagram-dedupe.test.ts`

**Interfaces:**
- Consumes: `ExistingContact` type from `src/lib/contacts/dedupe.ts` (already defined: `{ id: string; phone: string; name?: string | null; [key: string]: unknown }` — reuse as-is, `phone` being typed `string` there is fine since Instagram-found contacts still satisfy the shape structurally with `phone: null`).
- Produces: `findExistingInstagramContact(db: SupabaseClient, accountId: string, instagramId: string): Promise<ExistingContact | null>`.

Unlike `findExistingContact` (phone-based, fuzzy last-8-digit prefilter + `phonesMatch` in JS), this is a plain exact match — IGSIDs don't have trunk-prefix variants or formatting differences to reconcile.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/contacts/instagram-dedupe.test.ts
import { describe, expect, it, vi } from "vitest";
import { findExistingInstagramContact } from "./instagram-dedupe";

function fakeSupabase(returnData: unknown, returnError: unknown = null) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
  } as never;
}

describe("findExistingInstagramContact", () => {
  it("returns the matching contact when found", async () => {
    const contact = { id: "c1", phone: null, instagram_id: "179847374527", name: "Zara" };
    const db = fakeSupabase(contact);
    const result = await findExistingInstagramContact(db, "acct1", "179847374527");
    expect(result).toEqual(contact);
  });

  it("returns null when no contact matches", async () => {
    const db = fakeSupabase(null);
    const result = await findExistingInstagramContact(db, "acct1", "179847374527");
    expect(result).toBeNull();
  });

  it("returns null on a query error rather than throwing", async () => {
    const db = fakeSupabase(null, { message: "boom" });
    const result = await findExistingInstagramContact(db, "acct1", "179847374527");
    expect(result).toBeNull();
  });

  it("returns null for an empty instagramId without querying", async () => {
    const db = fakeSupabase(null);
    const result = await findExistingInstagramContact(db, "acct1", "");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/contacts/instagram-dedupe.test.ts`
Expected: FAIL — `Cannot find module './instagram-dedupe'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/contacts/instagram-dedupe.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingContact } from "./dedupe";

/**
 * Find an existing contact in `accountId` whose instagram_id exactly
 * matches `instagramId`, or null. Unlike findExistingContact (phone),
 * this is a plain exact match — no normalization/fuzzy-suffix step,
 * since an IGSID has no formatting variants to reconcile.
 */
export async function findExistingInstagramContact(
  db: SupabaseClient,
  accountId: string,
  instagramId: string,
): Promise<ExistingContact | null> {
  if (!instagramId) return null;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("instagram_id", instagramId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExistingContact;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contacts/instagram-dedupe.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck, then commit**

```bash
cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit
git add src/lib/contacts/instagram-dedupe.ts src/lib/contacts/instagram-dedupe.test.ts
git commit -m "Add exact-match Instagram contact lookup"
git push origin main
```

---

### Task 3: Instagram Graph API send helper

**Files:**
- Create: `src/lib/instagram/graph-api.ts`
- Test: `src/lib/instagram/graph-api.test.ts`

**Interfaces:**
- Produces: `sendInstagramTextMessage(params: { igUserId: string; accessToken: string; to: string; text: string }): Promise<{ messageId: string }>`. Throws on any Graph API error response (caller catches, same pattern as `sendTextMessage` in `src/lib/whatsapp/meta-api.ts` — read that file first for the exact error-handling shape to mirror).

Text-only for v1 — media sends (image/video/document) are explicitly out of scope for this task; the send route (Task 5) rejects non-text `message_type` for Instagram conversations with a clear 400 rather than silently mishandling it.

- [ ] **Step 1: Read the WhatsApp equivalent first**

Read `src/lib/whatsapp/meta-api.ts`'s `sendTextMessage` function in full — match its error-throwing convention (what it throws on a non-2xx Graph response, what shape the thrown error takes) exactly, since `/api/whatsapp/send`'s existing catch block (Task 5) expects that shape.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/instagram/graph-api.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendInstagramTextMessage } from "./graph-api";

describe("sendInstagramTextMessage", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts to the Graph API messages endpoint and returns the message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: "mid.123" }),
    });
    global.fetch = fetchMock as never;

    const result = await sendInstagramTextMessage({
      igUserId: "17841400000000000",
      accessToken: "test-token",
      to: "179847374527",
      text: "Hello",
    });

    expect(result).toEqual({ messageId: "mid.123" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("17841400000000000/messages"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws with the Graph API error message on a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Invalid recipient" } }),
    }) as never;

    await expect(
      sendInstagramTextMessage({
        igUserId: "17841400000000000",
        accessToken: "test-token",
        to: "bad-id",
        text: "Hello",
      }),
    ).rejects.toThrow("Invalid recipient");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/instagram/graph-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the implementation**

Match whatever exact error-throw convention Step 1 found in `meta-api.ts` — the skeleton below assumes it throws `new Error(data.error.message)` on failure; adjust to match reality if `meta-api.ts` does something more specific (e.g. a custom error class).

```ts
// src/lib/instagram/graph-api.ts
const GRAPH_API_VERSION = "v20.0";

interface SendTextParams {
  igUserId: string;
  accessToken: string;
  to: string;
  text: string;
}

interface SendResult {
  messageId: string;
}

/**
 * Send a plain-text Instagram DM via the Graph API, using the Page
 * access token already verified and stored by the Integration Hub.
 * Text-only for v1 — see docs/superpowers/specs/2026-08-14-instagram-dm-automation-design.md.
 */
export async function sendInstagramTextMessage(params: SendTextParams): Promise<SendResult> {
  const { igUserId, accessToken, to, text } = params;
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: to },
        message: { text },
        access_token: accessToken,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Instagram send failed (HTTP ${res.status})`);
  }
  return { messageId: data.message_id };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/instagram/graph-api.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Typecheck, then commit**

```bash
cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit
git add src/lib/instagram/graph-api.ts src/lib/instagram/graph-api.test.ts
git commit -m "Add Instagram Graph API text-send helper"
git push origin main
```

---

### Task 4: `/api/n8n/log` — accept `channel` and `instagram_id`

**Files:**
- Modify: `src/app/api/n8n/log/route.ts`

**Interfaces:**
- Consumes: `findExistingInstagramContact` (Task 2).
- Produces: the route now accepts `channel?: 'whatsapp' | 'instagram'` (defaults to `'whatsapp'`) and `instagram_id?: string` in its POST body. `phone_number` becomes required only when `channel !== 'instagram'`.

Everything downstream of contact/conversation resolution in this file (message insert, the content-based idempotency guard, `is_qualified`/`is_escalated` detection, the real-time alert) is already channel-agnostic — do not touch any of it.

- [ ] **Step 1: Read the current file in full**

Read `src/app/api/n8n/log/route.ts` end to end — it's already been modified twice this session (contact_name field, is_qualified detection), confirm the exact current shape before editing rather than working from memory.

- [ ] **Step 2: Add the new body fields and import**

Add to the request body type (near the existing `contact_name?: string` field):

```ts
    /** 'whatsapp' (default) or 'instagram'. Determines whether contact
     * resolution uses phone_number or instagram_id. */
    channel?: 'whatsapp' | 'instagram'
    /** Meta's Instagram-Scoped ID — required when channel === 'instagram', used instead of phone_number. */
    instagram_id?: string
```

Add the import: `import { findExistingInstagramContact } from '@/lib/contacts/instagram-dedupe'`

- [ ] **Step 3: Make `phone_number` conditionally required**

Find the existing validation block:

```ts
  if (!body.phone_number?.trim()) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }
```

Replace with:

```ts
  const channel = body.channel === 'instagram' ? 'instagram' : 'whatsapp'
  if (channel === 'instagram') {
    if (!body.instagram_id?.trim()) {
      return NextResponse.json({ error: 'instagram_id is required when channel is instagram' }, { status: 400 })
    }
  } else if (!body.phone_number?.trim()) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }
```

- [ ] **Step 4: Branch contact resolution**

Find the existing block:

```ts
  const normalizedPhone = normalizePhone(body.phone_number.trim())
  const contactName = body.contact_name?.trim()
  const contact = await findExistingContact(admin, accountId, normalizedPhone).catch(() => null)
```

This line assumes `body.phone_number` is always present, which is no longer true for the Instagram case. Replace with:

```ts
  const contactName = body.contact_name?.trim()
  const normalizedPhone = channel === 'whatsapp' ? normalizePhone(body.phone_number!.trim()) : null
  const instagramId = channel === 'instagram' ? body.instagram_id!.trim() : null
  const contact =
    channel === 'instagram'
      ? await findExistingInstagramContact(admin, accountId, instagramId!).catch(() => null)
      : await findExistingContact(admin, accountId, normalizedPhone!).catch(() => null)
```

- [ ] **Step 5: Fix every use of `normalizedPhone` below this point**

The rest of the function uses `normalizedPhone` as a plain string in several places (contact creation's `phone:` field, the new-contact insert, the response, log lines). Read through the rest of the function and update each:

- The new-contact insert (`.insert({ account_id: accountId, user_id: userId, phone: normalizedPhone, name: contactName || normalizedPhone })`) needs: `phone: channel === 'whatsapp' ? normalizedPhone : null, instagram_id: channel === 'instagram' ? instagramId : null, channel, name: contactName || normalizedPhone || instagramId`.
- Anywhere the code falls back to `normalizedPhone` for a display name or log line when `contactName` is absent (e.g. `contactRow?.phone ?? normalizedPhone` in the alert-firing block added this session) needs an `?? instagramId` fallback added alongside, since `normalizedPhone` is now `null` on the Instagram path.

Search the file for every occurrence of `normalizedPhone` after this point and check each one handles the `null` case — don't leave any that would silently produce the string `"null"` in a message or contact name.

- [ ] **Step 6: Typecheck**

Run: `cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit`
Expected: clean. tsc will catch any remaining place `normalizedPhone`/`instagramId` is used without a null check, since they're now typed `string | null` — fix everything it flags.

- [ ] **Step 7: Lint, then commit**

```bash
npx eslint src/app/api/n8n/log/route.ts
git add src/app/api/n8n/log/route.ts
git commit -m "Accept channel/instagram_id on /api/n8n/log for Instagram-routed messages"
git push origin main
```

---

### Task 5: `/api/whatsapp/send` — branch outbound on `contact.channel`

**Files:**
- Modify: `src/app/api/whatsapp/send/route.ts`
- Modify: `src/lib/integration-verify.ts` (capture the Instagram Page id at verification time — Step 1)

**Interfaces:**
- Consumes: `sendInstagramTextMessage` (Task 3).
- Produces: no change to the route's URL or request/response shape — `message-thread.tsx`'s 3 existing calls to `/api/whatsapp/send` need zero changes, since the branch happens server-side on the resolved conversation's contact.

Kept as the same endpoint deliberately (not a new `/api/instagram/send`) — the frontend already has 3 call sites hardcoded to this URL and has no reason to know which channel a conversation is on before sending.

- [ ] **Step 1: Make `Contact.phone` nullable and fix the fallout**

Task 1 deliberately left `Contact.phone` typed as `string` (not `string | null`) even though the DB column became nullable, since no code path created a null-phone contact yet. This task is where that stops being true — Instagram contacts flow through here. Flip the type now, in `src/types/index.ts`:

```ts
  phone: string | null;
```

Run `cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit` immediately after this one-line change, before writing any of the rest of this task. Every error it reports is a real place in the codebase that currently assumes `contact.phone` is always a string — fix each one with a proper channel/null check (not `!` or `as string`), across every file tsc flags, not only `whatsapp/send/route.ts`. Common shapes you'll likely hit: a WhatsApp-only display fallback like `contact.name || contact.phone` (safe as-is, `||` already handles null), versus a direct call like `sanitizePhoneForMeta(contact.phone)` with no preceding guard (unsafe, needs one). Re-run tsc after each fix until it's clean, then continue to Step 2.

- [ ] **Step 2: Capture the Instagram Page id at verification time**

`integrations.config` currently only stores `{ page: data.name }` for the Instagram/Facebook verifier — the numeric Page id (`1112429075279428` for Scale AI, confirmed live this session) was never captured, even though the Graph API's `/me` call already returns it as `data.id`. Fix the verifier to store it, so `/api/whatsapp/send` (Step 3 below) has a real place to read it from instead of a hardcoded value that would silently go stale if the connected account ever changes.

In `src/lib/integration-verify.ts`, find:

```ts
async function verifyMetaGraphToken(fields: Record<string, string>): Promise<VerifyResult> {
  const token = fields.page_access_token?.trim()
  if (!token) return { ok: false, error: 'Page access token required.' }
  const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`)
  const data = await res.json()
  if (data.error) return { ok: false, error: `Meta rejected the token: ${data.error.message}.` }
  return { ok: true, meta: { page: data.name } }
}
```

Change the last line to also capture the id:

```ts
  return { ok: true, meta: { page: data.name, pageId: data.id } }
```

This only takes effect the next time the integration is saved (the connect route writes `meta` into `config` on save — see `src/app/api/integrations/connect/route.ts:77`). After this ships, re-save the Instagram integration once from Settings → Integrations (paste the same token back in) so `config.pageId` actually populates — flag this to Umer as a required manual step before Task 5's send path can work, don't assume it backfills itself.

- [ ] **Step 3: Locate the phone-validation gate**

In `src/app/api/whatsapp/send/route.ts`, find:

```ts
    const contact = conversation.contact
    if (!contact?.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      )
    }

    // Sanitize and validate phone
    const sanitizedPhone = sanitizePhoneForMeta(contact.phone)
    if (!isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }
```

This whole block, plus everything through the Meta send attempt, assumes WhatsApp. Wrap it in a channel branch.

- [ ] **Step 4: Add the Instagram branch**

Replace the block from Step 3 through the existing `try { ... } catch` around the Meta send (the `attempt`/`phoneVariants` loop) with:

```ts
    const contact = conversation.contact
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 400 })
    }

    if (contact.channel === 'instagram') {
      if (message_type !== 'text') {
        return NextResponse.json(
          { error: 'Instagram sends only support text messages in this version.' },
          { status: 400 },
        )
      }
      if (!contact.instagram_id) {
        return NextResponse.json({ error: 'Contact has no Instagram id' }, { status: 400 })
      }

      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('credentials_encrypted, config')
        .eq('account_id', accountId)
        .eq('service', 'instagram')
        .eq('status', 'connected')
        .maybeSingle()

      if (integrationError || !integration?.credentials_encrypted) {
        return NextResponse.json(
          { error: 'Instagram not connected. Connect it in Settings → Integrations first.' },
          { status: 400 },
        )
      }

      const igPageId = (integration.config as { pageId?: string } | null)?.pageId
      if (!igPageId) {
        return NextResponse.json(
          { error: 'Instagram integration is missing a page id — re-save the credential in Settings → Integrations to refresh it.' },
          { status: 500 },
        )
      }

      const { page_access_token: pageAccessToken } = JSON.parse(
        decryptText(integration.credentials_encrypted),
      ) as { page_access_token?: string }
      if (!pageAccessToken) {
        return NextResponse.json({ error: 'Instagram credential is missing a page_access_token.' }, { status: 500 })
      }

      let igMessageId: string
      try {
        const result = await sendInstagramTextMessage({
          igUserId: igPageId,
          accessToken: pageAccessToken,
          to: contact.instagram_id,
          text: content_text,
        })
        igMessageId = result.messageId
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Instagram API error'
        console.error('Instagram Graph API send failed:', message)
        return NextResponse.json({ error: `Instagram API error: ${message}` }, { status: 502 })
      }

      const { data: messageRecord, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id,
          sender_type: 'agent',
          content_type: 'text',
          content_text: encryptContent(content_text),
          message_id: igMessageId,
          status: 'sent',
          reply_to_message_id: reply_to_message_id || null,
        })
        .select()
        .single()

      if (msgError) {
        console.error('Error inserting sent Instagram message:', msgError)
        return NextResponse.json(
          { error: `Message sent to Instagram but failed to save to DB: ${msgError.message}` },
          { status: 500 },
        )
      }

      const now = new Date().toISOString()
      await supabase
        .from('conversations')
        .update({ last_message_text: content_text, last_message_at: now, updated_at: now })
        .eq('id', conversation_id)

      return NextResponse.json({
        success: true,
        message_id: messageRecord.id,
        instagram_message_id: igMessageId,
      })
    }

    // --- Existing WhatsApp path below, unchanged ---
    if (!contact.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      )
    }

    // Sanitize and validate phone
    const sanitizedPhone = sanitizePhoneForMeta(contact.phone)
    if (!isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }
```

- [ ] **Step 5: Add imports**

```ts
import { decryptText } from '@/lib/crypto'
import { sendInstagramTextMessage } from '@/lib/instagram/graph-api'
```

(`decryptText` may already be imported under a different alias — check before adding a duplicate.)

- [ ] **Step 6: Typecheck**

Run: `cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Lint, then commit**

Step 1's tsc fallout may have touched files beyond the two listed below (any file that read `contact.phone` without a guard) — lint and stage everything Step 1-4 actually changed, not just this fixed list:

```bash
git status --short
npx eslint src/app/api/whatsapp/send/route.ts src/lib/integration-verify.ts src/types/index.ts
# plus any other file Step 1's tsc fallout touched — eslint those too
git add -A -- src/app/api/whatsapp/send/route.ts src/lib/integration-verify.ts src/types/index.ts
# plus any other file Step 1's tsc fallout touched
git commit -m "Branch /api/whatsapp/send on contact.channel; make Contact.phone nullable; capture Instagram page id on verify"
git push origin main
```

Then re-save the Instagram credential once from Settings → Integrations (Step 2) so `config.pageId` actually populates before testing an Instagram send.

---

### Task 6: Inbox UI — channel indicator

**Files:**
- Modify: `src/components/inbox/conversation-list.tsx`

**Interfaces:**
- Consumes: `conversation.contact.channel` (Task 1's type change).

- [ ] **Step 1: Add a channel icon next to the existing badges**

In the same badge row already holding the Qualified/Lead/Escalated pills (added earlier this session — search for `is_qualified &&` in this file to find the spot), add a small channel indicator. Use `lucide-react`'s `Instagram` icon (already a common lucide export) for the Instagram case; omit any icon for WhatsApp (the existing WhatsApp-brand-colored avatar/theme already implies the default channel, so only the *exception* needs a visual marker — adding a WhatsApp icon to every single row that's already WhatsApp would be noise, not signal).

```tsx
{conversation.contact?.channel === 'instagram' && (
  <span
    className="flex h-4 w-4 items-center justify-center rounded-full bg-pink-500/15 text-pink-500"
    title="Instagram"
  >
    <Instagram className="h-2.5 w-2.5" />
  </span>
)}
```

Add `Instagram` to the existing `lucide-react` import line at the top of the file.

- [ ] **Step 2: Typecheck and lint**

```bash
cd /Users/umerahmed/Projects/scale-agency-crm && rm -rf .next && npx tsc --noEmit
npx eslint src/components/inbox/conversation-list.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/conversation-list.tsx
git commit -m "Add Instagram channel indicator to inbox list rows"
git push origin main
```

---

### Task 7: n8n — Instagram webhook receiver + payload normalization

This task edits the live "SA (staging)" workflow. Read before writing: `n8n_get_workflow` with `mode: filtered`, `nodeNames: ["Extract Message", "Is New Message?"]` to see current state fresh (it may have changed since this plan was written).

**n8n changes:**

**Decision, made here rather than deferred**: the receiver lives in n8n, as a `n8n-nodes-base.webhook` node — not a new route in this repo. Reason: this exact account's own "Scale Agency CRM — Upgrade Request Alert" workflow already uses the precedented pattern this needs (webhook in → `if` node checks a condition → `respondToWebhook` echoes back a specific value) — Meta's verification handshake (GET with `hub.mode`/`hub.verify_token`/`hub.challenge`, must echo `hub.challenge` back as plain text when the token matches) is the same shape, not a new pattern to invent. Keeping it in n8n also means Task 7 and Task 8 stay in one place instead of splitting the feature across this repo and the workflow.

- [ ] **Step 1: Add the webhook node and verification branch**

Use `n8n_update_partial_workflow` with `addNode` operations to add, positioned near the existing "WhatsApp Trigger" node:

1. `n8n-nodes-base.webhook` named "Instagram Webhook", `httpMethod: "GET,POST"`, path e.g. `instagram-dm`, `responseMode: "responseNode"` (so a downstream `respondToWebhook` node controls the reply instead of the webhook node auto-responding).
2. `n8n-nodes-base.if` named "Is Verification Request?", checking `{{$json.query.hub_mode}} === "subscribe"` (n8n normalizes query param dots to underscores — confirm this against a real incoming request in Step 3, don't assume it's exactly right on paper).
3. `n8n-nodes-base.code` named "Check Verify Token", comparing `$json.query.hub_verify_token` against a secret Umer picks when configuring the subscription in Meta's dashboard (Task 9, Step 1) — store the secret as an n8n environment variable the same way `N8N_SEND_API_KEY`-equivalent secrets are handled elsewhere in this account, not hardcoded in the node.
4. `n8n-nodes-base.respondToWebhook` named "Respond Challenge", returning `{{$json.query.hub_challenge}}` as plain text (`respondWith: "text"`) when the token matches, or a 403 when it doesn't — mirrors "Respond OK"/"Respond Unauthorized" in the Upgrade Request Alert workflow exactly.

The other branch of "Is Verification Request?" (real message deliveries, which are POST, not GET) continues to Step 2.

- [ ] **Step 2: Normalize Instagram's webhook payload shape**

Add a `n8n-nodes-base.code` node ("Extract Instagram Message") on the non-verification branch, mapping Instagram/Messenger Platform's webhook shape (`entry[].messaging[]` → `{sender: {id}, recipient: {id}, timestamp, message: {mid, text}}` — structurally different from WhatsApp's `entry[].changes[].value.messages[]`) into the same intermediate shape "Extract Message" already produces for WhatsApp: `message_id ← message.mid`, `from ← sender.id` (the IGSID — flows into `instagram_id`, not `phone_number`), `type ← 'text'` (v1 scope — attachments/story-replies are a fast-follow, matching Task 3's text-only send limitation), `text ← message.text`, plus a new `channel: 'instagram'` field the rest of the flow can branch on (Task 8, Step 3 needs this). `contact_name` has no equivalent in Instagram's payload (no inline display name the way WhatsApp's `contacts[0].profile.name` works) — leave it empty; the contact shows as their IGSID until Umer renames them, same honest-degradation as any WhatsApp contact with no set display name.

Connect this node's output into the existing "Dedupe Check" node (same one WhatsApp messages already flow through) — the message-id dedup logic is already channel-agnostic, no changes needed there.

- [ ] **Step 3: Apply via n8n-mcp, then verify against a real request**

Apply Steps 1-2 via `n8n_update_partial_workflow`, then `n8n_get_workflow` (`mode: filtered`) to confirm the graph landed as intended. Real verification of the exact query-param key names and payload shape only happens once Meta actually sends a real handshake/message (Task 9) — if either differs from what's written above, fix the node code directly rather than treating this step's assumptions as final.

---

### Task 8: n8n — send-side Instagram node

**Files:** none in this repo — n8n workflow only.

- [ ] **Step 1: Add a credential**

New n8n `httpHeaderAuth` credential for the Instagram Page access token (same credential *type* as "Scale Agency WA Bearer Header", separate credential *instance* — don't reuse the WhatsApp one, they're different tokens for different Meta products even though both ride Graph API). Umer creates this in the n8n UI directly (credential creation isn't exposed through `n8n-mcp`'s workflow-editing tools) using the same Page access token already generated and verified in Scale OS's Integration Hub this session.

- [ ] **Step 2: Add the send node**

`n8n_update_partial_workflow` with `addNode`: a `n8n-nodes-base.httpRequest` node named "Send Instagram Message", modeled directly on the existing "Send WhatsApp Message" node fetched earlier — `POST https://graph.facebook.com/v20.0/1112429075279428/messages` (the Scale AI Page id, confirmed this session — not the WhatsApp `phone_number_id`), `authentication: genericCredentialType`, `genericAuthType: httpHeaderAuth`, pointing at the new credential from Step 1, JSON body `{recipient: {id: "={{$json.instagram_id}}"}, message: {text: "={{$json.reply_text}}"}}` (adjust field names to match whatever the upstream "Build ... Payload" nodes actually produce — read one of them, e.g. "Build Welcome Payload", via `n8n_get_workflow` filtered fetch first, don't guess the field name).

- [ ] **Step 3: Wire it into the existing routing**

The existing "Route Action" switch node fans out to per-stage "Build ... Payload" nodes, each of which already connects to `["Log Outbound Attempt", "Log To CRM Inbox", "Prep Send Guard"]` in parallel, with "Prep Send Guard" eventually leading to "Send WhatsApp Message". For Instagram-originated conversations, that same chain needs to reach "Send Instagram Message" instead. Add an `n8n-nodes-base.if` node (e.g. "Is Instagram Channel?", checking a `channel` field carried through the item from Task 7's normalization) between "Restore Payload After Guard" and the two send nodes, routing to "Send Instagram Message" on true and the existing "Send WhatsApp Message" on false.

- [ ] **Step 4: Verify with Umer**

Fetch the updated workflow structure (`mode: structure`) and walk Umer through the new node graph before considering this task done — this is the highest-blast-radius task in the whole plan (live workflow, real customers on the WhatsApp side already flowing through the untouched parts of the same graph).

---

### Task 9: End-to-end verification

**Files:** none — manual verification only.

- [ ] **Step 1: Configure the Meta webhook subscription**

In Meta's App dashboard for "The Scale Agency" (App ID `1690695308728382`) → Webhooks → Instagram product → subscribe the `messages` field, pointing at whichever endpoint Task 7 settled on, using the verify token configured there.

- [ ] **Step 2: Send a real test DM**

From a phone/account that isn't the @scaleagencyai account itself, send a real Instagram DM to @scaleagencyai. Confirm:
- It lands in the Scale OS inbox with the pink Instagram badge (Task 6).
- The bot's qualifying-question flow responds (Task 7/8's wiring).
- Answering a qualifying question with a real answer flips `is_qualified` the same way a WhatsApp conversation does (no code change needed here — confirm the existing detection logic really does apply unchanged).
- Manually reply from the Scale OS composer on that conversation and confirm it delivers as a real Instagram DM (Task 5).

- [ ] **Step 2: Report results to Umer**

Any mismatch between expected and actual behavior at this stage is real signal about Instagram's actual webhook payload shape (Task 7 Step 2 was written from general Messenger Platform knowledge, not a live-tested payload) — fix forward rather than treating this as a rubber-stamp step.
