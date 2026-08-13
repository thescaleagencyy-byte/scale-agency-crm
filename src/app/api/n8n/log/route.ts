import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { encryptContent } from '@/lib/crypto'

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
 *   phone_number    string  — the other party's phone
 *   message         string  — message text to log
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

  if (!body.phone_number?.trim()) {
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

  const normalizedPhone = normalizePhone(body.phone_number.trim())
  const contact = await findExistingContact(admin, accountId, normalizedPhone).catch(() => null)

  let conversationId: string | null = null

  if (contact) {
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
      .insert({ account_id: accountId, user_id: userId, phone: normalizedPhone, name: normalizedPhone })
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
      content_type: 'text',
      content_text: encryptContent(messageText),
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
    })
    .eq('id', conversationId)

  return NextResponse.json({ success: true, message_id: msg.id, conversation_id: conversationId })
}
