import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { encryptContent } from '@/lib/crypto'

/**
 * POST /api/n8n/quote
 *
 * Called by the Outlook → WhatsApp quote automation after each quote
 * email is processed (any terminal branch). Stores the delivery log
 * row and, when provided, the quote PDF in the `quote-pdfs` bucket.
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   status          string  — 'sent' | 'failed' | 'no_number' | 'received'
 *   customer_phone  string? — recipient WhatsApp number (absent on no_number)
 *   customer_name   string? — name extracted from the quote email
 *   company         string? — company extracted from the quote email
 *   email_subject   string? — subject of the source email
 *   sender_email    string? — salesperson mailbox that sent the quote
 *   pdf_filename    string? — original attachment filename
 *   pdf_base64      string? — PDF content, base64 (skipped if absent/oversized)
 *   wa_message_id   string? — Meta message id on successful send
 *   media_id        string? — Meta media id from the upload step
 *   error_detail    string? — Graph error body on failure
 *
 * The PDF upload is best-effort: a storage failure still logs the row
 * (pdf_path null) — losing the file must never lose the audit trail.
 */

const VALID_STATUSES = new Set(['received', 'sent', 'failed', 'no_number'])
// Vercel route payloads cap at ~4.5 MB; leave headroom for JSON overhead.
const MAX_PDF_BYTES = 3.5 * 1024 * 1024

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Quote endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    status?: string
    customer_phone?: string
    customer_name?: string
    company?: string
    email_subject?: string
    sender_email?: string
    pdf_filename?: string
    pdf_base64?: string
    wa_message_id?: string
    media_id?: string
    error_detail?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const status = body.status?.trim() || 'received'
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Resolve account — same convention as /api/n8n/lead.
  const { data: configs } = await admin
    .from('whatsapp_config')
    .select('account_id, user_id, updated_at, created_at')
    .eq('status', 'connected')
  if (!configs?.length) {
    return NextResponse.json({ error: 'No active WhatsApp config.' }, { status: 404 })
  }
  configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))
  const accountId = configs[0].account_id
  const configUserId = configs[0].user_id

  // Best-effort PDF upload — never blocks the log row.
  let pdfPath: string | null = null
  if (body.pdf_base64) {
    try {
      const buf = Buffer.from(body.pdf_base64, 'base64')
      if (buf.length > 0 && buf.length <= MAX_PDF_BYTES) {
        const safeName = (body.pdf_filename || 'quote.pdf')
          .replace(/[^\w.\-]+/g, '_')
          .slice(-80)
        const path = `account-${accountId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await admin.storage
          .from('quote-pdfs')
          .upload(path, buf, { contentType: 'application/pdf' })
        if (uploadError) console.error('[n8n/quote] PDF upload failed:', uploadError)
        else pdfPath = path
      }
    } catch (e) {
      console.error('[n8n/quote] PDF decode/upload threw:', e)
    }
  }

  // Link to an existing contact/conversation when the number matches,
  // auto-creating both when a send actually went out (status 'sent')
  // so the quote shows up in the inbox even for a brand-new customer —
  // same auto-create convention as /api/n8n/log.
  let contactId: string | null = null
  let conversationId: string | null = null
  let normalizedPhone: string | null = null
  if (body.customer_phone?.trim()) {
    normalizedPhone = normalizePhone(body.customer_phone.trim())
    const contact = await findExistingContact(admin, accountId, normalizedPhone).catch(() => null)
    if (contact) {
      contactId = contact.id
      const { data: conv } = await admin
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .maybeSingle()
      conversationId = conv?.id ?? null
    } else if (status === 'sent') {
      const { data: newContact } = await admin
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: configUserId,
          phone: normalizedPhone,
          name: body.customer_name?.trim() || normalizedPhone,
        })
        .select('id')
        .single()
      if (newContact) {
        contactId = newContact.id
        const { data: newConv } = await admin
          .from('conversations')
          .insert({ account_id: accountId, user_id: configUserId, contact_id: newContact.id })
          .select('id')
          .single()
        conversationId = newConv?.id ?? null
      }
    }
  }

  const { data: quote, error } = await admin
    .from('quotes')
    .insert({
      account_id: accountId,
      customer_name: body.customer_name?.trim() || null,
      customer_phone: normalizedPhone,
      company: body.company?.trim() || null,
      email_subject: body.email_subject?.trim() || null,
      sender_email: body.sender_email?.trim().toLowerCase() || null,
      pdf_filename: body.pdf_filename?.trim() || null,
      pdf_path: pdfPath,
      status,
      wa_message_id: body.wa_message_id?.trim() || null,
      media_id: body.media_id?.trim() || null,
      error_detail: body.error_detail?.trim() || null,
      contact_id: contactId,
      conversation_id: conversationId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[n8n/quote] DB insert failed:', error)
    return NextResponse.json({ error: 'Failed to save quote.' }, { status: 500 })
  }

  // Mirror a successful send into the inbox thread so the agent sees it
  // in the normal conversation view, not just the /quotes log. Best
  // effort — a failure here must never fail the quote log itself,
  // the send to the customer already happened either way.
  if (status === 'sent' && conversationId && pdfPath) {
    const filename = body.pdf_filename?.trim() || 'quote.pdf'
    const { data: msg, error: msgErr } = await admin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'document',
        content_text: encryptContent(filename),
        media_url: `quote-pdfs:${pdfPath}`,
        message_id: body.wa_message_id?.trim() || null,
        status: 'sent',
        is_automated: true,
      })
      .select('id')
      .single()

    if (msgErr) {
      console.error('[n8n/quote] Inbox message insert failed (non-fatal):', msgErr)
    } else if (msg) {
      await admin
        .from('conversations')
        .update({
          last_message_text: `📄 ${filename}`,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    }
  }

  return NextResponse.json({ success: true, quote_id: quote.id, pdf_stored: !!pdfPath })
}
