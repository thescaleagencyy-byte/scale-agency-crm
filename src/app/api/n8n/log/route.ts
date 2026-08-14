import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { encryptContent, decryptContent } from '@/lib/crypto'
import { detectsQualifyingReply } from '@/lib/inbox/qualified-reply'
import { triggerLeadAlert } from '@/lib/alerts/lead-alert'
import { findExistingInstagramContact } from '@/lib/contacts/instagram-dedupe'

/**
 * POST /api/n8n/log
 *
 * Logs a message to the CRM inbox WITHOUT sending it via Meta.
 * Use this after messages that are already sent/received directly via
 * Meta (bot replies, or inbound messages a native n8n WhatsApp trigger
 * already received) — so the conversation appears in the CRM inbox
 * without creating a duplicate send.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   phone_number    string  — the other party's phone. Required unless
 *                             channel is 'instagram'.
 *   message         string  — message text to log
 *   channel         string? — 'whatsapp' (default) or 'instagram'.
 *                             Determines whether contact resolution
 *                             uses phone_number or instagram_id.
 *   instagram_id    string? — Meta's Instagram-Scoped ID (IGSID).
 *                             Required when channel is 'instagram',
 *                             used instead of phone_number.
 *   phone_number_id string? — WABA phone_number_id the bot is bound to;
 *                             resolves tenant. Falls back to "most
 *                             recently updated connected config" when
 *                             omitted, for callers not yet updated.
 *   sender_type     string? — 'agent' (default) or 'customer'
 *   timestamp       string? — original WhatsApp message epoch seconds
 *                             (Meta's messages[].timestamp). When given,
 *                             used as the row's created_at instead of
 *                             insert time — inbound and outbound logs
 *                             race independently to hit this endpoint,
 *                             so insert order alone doesn't reflect real
 *                             chronological order.
 *   status          string? — 'open' | 'pending' | 'closed'. When given,
 *                             sets the conversation's status (e.g. a bot
 *                             marking a conversation 'pending' on human
 *                             handoff). Omit to leave status untouched —
 *                             most calls (routine bot replies) shouldn't
 *                             touch it.
 *   is_escalated    boolean? — true marks the conversation escalated,
 *                             surfaced in the inbox's dedicated
 *                             Escalations filter. Deliberately separate
 *                             from `status` so a bot escalation never
 *                             collides with an admin's own manual
 *                             Open/Pending/Closed triage. One-way: only
 *                             ever set to true here, cleared by an admin
 *                             resolving it in the UI.
 *   is_lead         boolean? — true marks the conversation a qualified
 *                             lead. One-way, same as is_escalated.
 *   referral        object?  — Meta's Click-to-WhatsApp ad referral
 *                             object (source_url, source_id, headline,
 *                             ctwa_clid, ...), forwarded verbatim from
 *                             the n8n WhatsApp trigger's raw webhook
 *                             payload (messages[0].referral). Mirrors
 *                             /api/whatsapp/webhook's native-path
 *                             capture: applied only when this call
 *                             creates a brand-new conversation, since
 *                             that's the only message that can
 *                             plausibly carry ad referral data.
 *   message_type    string? — WhatsApp message type ('image', 'video',
 *                             'audio', 'document', 'sticker', etc).
 *                             Determines the row's content_type; omit
 *                             (or 'text') to log a plain text message.
 *                             The n8n bot already sends this on every
 *                             call — was previously ignored here,
 *                             which meant every inbound voice note /
 *                             photo / video from n8n-routed tenants
 *                             got stored as content_type='text' with
 *                             just an emoji label, so the inbox never
 *                             rendered a real player for it.
 *   media_id        string? — Meta media id for image/video/audio/
 *                             document messages. Combined with
 *                             message_type to set media_url to
 *                             /api/whatsapp/media/{id} — the same
 *                             authenticated proxy route the native
 *                             webhook path already uses, so playback
 *                             works identically regardless of which
 *                             path received the message.
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    phone_number?: string
    message?: string
    phone_number_id?: string
    sender_type?: 'agent' | 'customer'
    timestamp?: string | number
    status?: string
    is_escalated?: boolean
    is_lead?: boolean
    message_type?: string
    media_id?: string
    /** WhatsApp display name from contacts[0].profile.name on the raw
     * Meta payload — same field /api/whatsapp/webhook's native path
     * already captures. Optional since older callers may not send it. */
    contact_name?: string
    /** 'whatsapp' (default) or 'instagram'. Determines whether contact
     * resolution uses phone_number or instagram_id. */
    channel?: 'whatsapp' | 'instagram'
    /** Meta's Instagram-Scoped ID — required when channel === 'instagram', used instead of phone_number. */
    instagram_id?: string
    referral?: {
      source_url?: string
      source_id?: string
      headline?: string
      ctwa_clid?: string
      [key: string]: unknown
    }
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const channel = body.channel === 'instagram' ? 'instagram' : 'whatsapp'
  if (channel === 'instagram') {
    if (!body.instagram_id?.trim()) {
      return NextResponse.json({ error: 'instagram_id is required when channel is instagram' }, { status: 400 })
    }
  } else if (!body.phone_number?.trim()) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  const senderType = body.sender_type === 'customer' ? 'customer' : 'agent'
  const VALID_STATUSES = ['open', 'pending', 'closed'] as const
  const requestedStatus = VALID_STATUSES.find((s) => s === body.status)

  const admin = supabaseAdmin()

  // Resolve account. Prefer the exact phone_number_id match (same
  // tenancy key /api/whatsapp/webhook and /api/n8n/lead use) — falls
  // back to the old "most recently updated" heuristic only when the
  // caller doesn't send phone_number_id yet, so existing clients'
  // live n8n workflows keep working unchanged.
  let accountId: string
  let userId: string
  if (body.phone_number_id?.trim()) {
    const { data: configRows, error: configError } = await admin
      .from('whatsapp_config')
      .select('account_id, user_id')
      .eq('phone_number_id', body.phone_number_id.trim())
      .eq('status', 'connected')
    if (configError) {
      console.error('[n8n/log] config fetch failed:', configError)
      return NextResponse.json({ error: 'Failed to resolve account.' }, { status: 500 })
    }
    if (!configRows?.length) {
      return NextResponse.json({ error: 'No connected WhatsApp config for phone_number_id.' }, { status: 404 })
    }
    if (configRows.length > 1) {
      console.error('[n8n/log] multiple configs for phone_number_id:', body.phone_number_id, configRows)
      return NextResponse.json({ error: 'Ambiguous account for phone_number_id.' }, { status: 409 })
    }
    accountId = configRows[0].account_id
    userId = configRows[0].user_id
  } else {
    const { data: configs } = await admin
      .from('whatsapp_config')
      .select('account_id, user_id, updated_at, created_at')
      .eq('status', 'connected')
    if (!configs?.length) {
      return NextResponse.json({ error: 'No active WhatsApp config.' }, { status: 404 })
    }
    configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))
    accountId = configs[0].account_id
    userId = configs[0].user_id
  }

  const contactName = body.contact_name?.trim()
  const normalizedPhone = channel === 'whatsapp' ? normalizePhone(body.phone_number!.trim()) : null
  const instagramId = channel === 'instagram' ? body.instagram_id!.trim() : null
  const contact =
    channel === 'instagram'
      ? await findExistingInstagramContact(admin, accountId, instagramId!).catch(() => null)
      : await findExistingContact(admin, accountId, normalizedPhone!).catch(() => null)

  let conversationId: string | null = null

  if (contact) {
    // Mirrors /api/whatsapp/webhook's native path: keep the contact's
    // name in sync with whatever WhatsApp reports, since a contact
    // created before this field existed (or before the customer set a
    // display name) would otherwise be stuck showing their phone
    // number forever.
    if (contactName && contactName !== contact.name) {
      await admin.from('contacts').update({ name: contactName }).eq('id', contact.id)
    }
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contact.id)
      .maybeSingle()
    conversationId = conv?.id ?? null
  } else {
    // Auto-create contact + conversation. Build the same adFields
    // shape /api/whatsapp/webhook's native path uses, from the
    // referral object n8n forwards off the raw Meta webhook payload.
    const adFields: Record<string, string | object | null> = {}
    if (body.referral) {
      adFields.ad_source_url = body.referral.source_url ?? null
      adFields.ad_source_id = body.referral.source_id ?? null
      adFields.ad_headline = body.referral.headline ?? null
      adFields.ad_ctwa_clid = body.referral.ctwa_clid ?? null
      adFields.referral_data = body.referral
    }
    const { data: newContact } = await admin
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        phone: channel === 'whatsapp' ? normalizedPhone : null,
        instagram_id: channel === 'instagram' ? instagramId : null,
        channel,
        name: contactName || normalizedPhone || instagramId,
      })
      .select('id')
      .single()
    if (newContact) {
      const { data: newConv } = await admin
        .from('conversations')
        .insert({ account_id: accountId, user_id: userId, contact_id: newContact.id, ...adFields })
        .select('id')
        .single()
      conversationId = newConv?.id ?? null
    }
  }

  if (!conversationId) {
    return NextResponse.json({ error: 'Could not resolve conversation.' }, { status: 500 })
  }

  const messageText = body.message.trim()

  // WhatsApp's 'sticker' and legacy 'button' types have no dedicated
  // slot in this schema's ContentType — sticker renders fine as an
  // image (both are just a static image to the bubble), button as
  // interactive (same "tap reply" affordance as a real interactive
  // message).
  const CONTENT_TYPE_MAP: Record<string, string> = {
    image: 'image',
    sticker: 'image',
    video: 'video',
    audio: 'audio',
    document: 'document',
    interactive: 'interactive',
    button: 'interactive',
  }
  const contentType = CONTENT_TYPE_MAP[body.message_type ?? ''] ?? 'text'
  const mediaUrl =
    body.media_id?.trim() && contentType !== 'text' && contentType !== 'interactive'
      ? `/api/whatsapp/media/${body.media_id.trim()}`
      : null

  // Idempotency guard — the n8n bot flow already runs its own lock +
  // dedupe logic, but under contention its lock is a bounded 4-retry
  // wait that force-proceeds without a real guarantee, so this endpoint
  // can still get hit twice for the same message. The payload carries
  // no Meta message_id to key off (unlike /api/whatsapp/webhook), so
  // dedupe by content instead: if this sender's most recent messages in
  // this conversation already contain this exact text, treat it as a
  // repeat delivery rather than a new message. Tradeoff: a genuine
  // back-to-back identical message (e.g. someone retyping "ok" twice)
  // would also get suppressed — accepted as the far rarer case compared
  // to retry-duplicates.
  const { data: recentSameSender } = await admin
    .from('messages')
    .select('content_text')
    .eq('conversation_id', conversationId)
    .eq('sender_type', senderType)
    .eq('content_type', contentType)
    .order('created_at', { ascending: false })
    .limit(3)
  const isDuplicate = (recentSameSender ?? []).some(
    (m) => decryptContent(m.content_text) === messageText,
  )
  if (isDuplicate) {
    return NextResponse.json({ success: true, duplicate: true })
  }

  // Fetch the message immediately before this one (any sender) so the
  // qualified-lead check below can see whether it was a bot/agent
  // question — must happen before the insert, otherwise the row we
  // just inserted would be its own "preceding" message.
  const { data: precedingRow } = await admin
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const precedingMessage = precedingRow
    ? { sender_type: precedingRow.sender_type, content_text: decryptContent(precedingRow.content_text) }
    : null

  const timestampSeconds = Number(body.timestamp)
  const createdAt =
    Number.isFinite(timestampSeconds) && timestampSeconds > 0
      ? new Date(timestampSeconds * 1000).toISOString()
      : undefined

  // Mirrors the isFirstInboundMessage check in /api/whatsapp/webhook:
  // computed before insert so the count is accurate. A customer message
  // beyond their first is a genuine reply, not just the opening
  // ad-triggered greeting — surfaced in the inbox list as has_customer_replied.
  let isReplyFromCustomer = false
  if (senderType === 'customer') {
    const { count: priorCustomerMsgCount } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
    isReplyFromCustomer = (priorCustomerMsgCount ?? 0) > 0
  }

  const { data: msg, error: msgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: senderType,
      content_type: contentType,
      content_text: encryptContent(messageText),
      ...(mediaUrl ? { media_url: mediaUrl } : {}),
      status: 'sent',
      is_automated: senderType === 'agent',
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select('id')
    .single()

  if (msgErr) {
    console.error('[n8n/log] DB insert failed:', msgErr)
    return NextResponse.json({ error: 'Failed to log message.' }, { status: 500 })
  }

  // Qualified-lead detection — deterministic, rule-based (no LLM call):
  // real signal that a real business question got a real answer, kept
  // separate from is_lead (n8n's own judgment call, already proven too
  // loose, and depended on by meta-ads/rollup.ts for ad ROI reporting
  // so it can't be redefined here). Only customer messages can qualify
  // a conversation.
  const qualifiesNow =
    senderType === 'customer' &&
    detectsQualifyingReply({
      precedingMessage,
      newMessage: { content_type: contentType, content_text: messageText },
    })

  // Fetch prior state to detect true false→true transitions — both for
  // is_qualified (computed here) and is_escalated (reported by the bot
  // via body.is_escalated) — so the real-time alert fires exactly once
  // per conversation per event type, not on every subsequent message.
  const { data: priorState } = await admin
    .from('conversations')
    .select('is_qualified, is_escalated')
    .eq('id', conversationId)
    .maybeSingle()
  const becomesQualified = qualifiesNow && !priorState?.is_qualified
  const becomesEscalated = body.is_escalated === true && !priorState?.is_escalated

  await admin
    .from('conversations')
    .update({
      last_message_text: messageText,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(isReplyFromCustomer ? { has_customer_replied: true } : {}),
      ...(requestedStatus ? { status: requestedStatus } : {}),
      ...(body.is_escalated === true ? { is_escalated: true } : {}),
      ...(body.is_lead === true ? { is_lead: true } : {}),
      ...(qualifiesNow ? { is_qualified: true } : {}),
    })
    .eq('id', conversationId)

  if (becomesQualified || becomesEscalated) {
    const [{ data: account }, { data: contactRow }] = await Promise.all([
      admin.from('accounts').select('name').eq('id', accountId).maybeSingle(),
      admin.from('contacts').select('name, phone').eq('id', contact?.id ?? '').maybeSingle(),
    ])
    const alertBase = {
      accountName: account?.name ?? 'Scale OS',
      contactName: contactRow?.name ?? normalizedPhone ?? instagramId,
      contactPhone: contactRow?.phone ?? normalizedPhone ?? instagramId,
      conversationId,
    }
    if (becomesQualified) triggerLeadAlert({ ...alertBase, type: 'qualified' })
    if (becomesEscalated) triggerLeadAlert({ ...alertBase, type: 'escalated' })
  }

  return NextResponse.json({ success: true, message_id: msg.id, conversation_id: conversationId })
}
