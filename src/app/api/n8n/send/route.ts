import { NextResponse } from 'next/server'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizePhone, sanitizePhoneForMeta, isValidE164, phoneVariants } from '@/lib/whatsapp/phone-utils'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * POST /api/n8n/send
 *
 * Called by n8n automations to send a WhatsApp message through the CRM.
 * The CRM sends to Meta, logs the message in the conversation, and returns
 * the message ID. Messages appear in the inbox tagged as "⚡ Automated".
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   phone_number  string   — recipient's phone number (any format)
 *   message       string   — text to send
 *   account_id    string?  — required only on multi-tenant instances
 */
export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    console.error('[n8n/send] N8N_SEND_API_KEY is not set in environment')
    return NextResponse.json(
      { error: 'n8n send endpoint is not configured on this server.' },
      { status: 503 },
    )
  }

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────
  let body: { phone_number?: string; message?: string; account_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { phone_number, message, account_id: bodyAccountId } = body

  if (!phone_number?.trim()) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // ── Resolve account ───────────────────────────────────────────
  let accountId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: any

  if (bodyAccountId) {
    const { data, error } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', bodyAccountId)
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json(
        { error: 'No WhatsApp config found for this account_id.' },
        { status: 404 },
      )
    }
    accountId = bodyAccountId
    config = data
  } else {
    // Single-tenant: use the only active config
    const { data: configs, error } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('status', 'connected')
    if (error || !configs?.length) {
      return NextResponse.json(
        { error: 'No active WhatsApp configuration found.' },
        { status: 404 },
      )
    }
    if (configs.length > 1) {
      configs.sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
    }
    config = configs[0]
    accountId = config.account_id
  }

  // ── Decrypt access token ──────────────────────────────────────
  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return NextResponse.json(
      { error: 'Failed to decrypt WhatsApp access token. Check ENCRYPTION_KEY.' },
      { status: 500 },
    )
  }

  // ── Resolve contact ───────────────────────────────────────────
  const normalizedPhone = normalizePhone(phone_number.trim())
  const existingContact = await findExistingContact(admin, accountId, normalizedPhone)

  let contact = existingContact
  if (!contact) {
    // Auto-create a minimal contact so the message lands in the inbox
    const { data: newContact, error: createErr } = await admin
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: config.user_id,
        phone: normalizedPhone,
        name: normalizedPhone,
      })
      .select()
      .single()
    if (createErr || !newContact) {
      console.error('[n8n/send] Failed to create contact:', createErr)
      return NextResponse.json({ error: 'Failed to resolve contact.' }, { status: 500 })
    }
    contact = newContact!
  }

  // ── Resolve conversation ──────────────────────────────────────
  const { data: existingConv } = await admin
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contact!.id)
    .maybeSingle()

  let conversation = existingConv
  if (!conversation) {
    const { data: newConv, error: convErr } = await admin
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: config.user_id,
        contact_id: contact!.id,
      })
      .select()
      .single()
    if (convErr || !newConv) {
      console.error('[n8n/send] Failed to create conversation:', convErr)
      return NextResponse.json({ error: 'Failed to resolve conversation.' }, { status: 500 })
    }
    conversation = newConv
  }

  // ── Send via Meta ─────────────────────────────────────────────
  const sanitized = sanitizePhoneForMeta(normalizedPhone)
  if (!isValidE164(sanitized)) {
    return NextResponse.json(
      { error: `Invalid phone number: "${phone_number}"` },
      { status: 400 },
    )
  }

  let waMessageId = ''
  const variants = phoneVariants(sanitized)

  for (const variant of variants) {
    try {
      const result = await sendTextMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: variant,
        text: message.trim(),
      })
      waMessageId = result.messageId
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Only retry on "recipient not in allowed list" errors
      if (!msg.toLowerCase().includes('recipient') && !msg.toLowerCase().includes('allowed')) {
        return NextResponse.json({ error: `Meta API error: ${msg}` }, { status: 502 })
      }
    }
  }

  if (!waMessageId) {
    return NextResponse.json(
      { error: 'Meta rejected all phone number variants.' },
      { status: 502 },
    )
  }

  // ── Log in DB ─────────────────────────────────────────────────
  const { data: messageRecord, error: msgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      content_type: 'text',
      content_text: message.trim(),
      message_id: waMessageId,
      status: 'sent',
      is_automated: true,
    })
    .select()
    .single()

  if (msgErr) {
    console.error('[n8n/send] DB insert failed:', msgErr)
    return NextResponse.json(
      { error: 'Message sent to Meta but failed to save in DB.' },
      { status: 500 },
    )
  }

  // Update conversation preview
  await admin
    .from('conversations')
    .update({
      last_message_text: message.trim(),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  return NextResponse.json({
    success: true,
    message_id: messageRecord.id,
    whatsapp_message_id: waMessageId,
    conversation_id: conversation.id,
    contact_id: contact!.id,
  })
}
