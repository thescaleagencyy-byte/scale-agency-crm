import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { encryptContent } from '@/lib/crypto'

/**
 * POST /api/n8n/log
 *
 * Logs a bot message to CRM inbox WITHOUT sending it via Meta.
 * Use this after button/interactive messages that are already sent
 * directly to Meta — so the message appears in the CRM inbox
 * without creating a duplicate on the customer's phone.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   phone_number  string  — recipient phone
 *   message       string  — message text to log
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

  let body: { phone_number?: string; message?: string }
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

  const admin = supabaseAdmin()

  // Resolve account
  const { data: configs } = await admin
    .from('whatsapp_config')
    .select('account_id, user_id, updated_at, created_at')
    .eq('status', 'connected')
  if (!configs?.length) {
    return NextResponse.json({ error: 'No active WhatsApp config.' }, { status: 404 })
  }
  configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))
  const { account_id: accountId, user_id: userId } = configs[0]

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
    // Auto-create contact + conversation
    const { data: newContact } = await admin
      .from('contacts')
      .insert({ account_id: accountId, user_id: userId, phone: normalizedPhone, name: normalizedPhone })
      .select('id')
      .single()
    if (newContact) {
      const { data: newConv } = await admin
        .from('conversations')
        .insert({ account_id: accountId, user_id: userId, contact_id: newContact.id })
        .select('id')
        .single()
      conversationId = newConv?.id ?? null
    }
  }

  if (!conversationId) {
    return NextResponse.json({ error: 'Could not resolve conversation.' }, { status: 500 })
  }

  const messageText = body.message.trim()

  const { data: msg, error: msgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: 'text',
      content_text: encryptContent(messageText),
      status: 'sent',
      is_automated: true,
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
    })
    .eq('id', conversationId)

  return NextResponse.json({ success: true, message_id: msg.id, conversation_id: conversationId })
}
