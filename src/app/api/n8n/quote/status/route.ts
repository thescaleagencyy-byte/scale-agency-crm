import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * POST /api/n8n/quote/status
 *
 * Called by "AshWheelz FINAL V5" (the workflow that owns the WABA's
 * one Meta webhook callback) for every WhatsApp status event on the
 * number — not just quote sends. Most calls will match no row here
 * (customer chat messages, statuses for non-quote sends) and that is
 * expected: a no-match is a silent no-op, not an error, since this
 * endpoint can't tell in advance which wamid belongs to a quote.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var
 * (same key as /api/n8n/quote).
 *
 * Body:
 *   wa_message_id   string  — Meta wamid the status event is for
 *   delivery_status string  — 'sent' | 'delivered' | 'read' | 'failed'
 *   timestamp       string? — Meta's unix-seconds event timestamp
 */

const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4, // terminal — once set, later sent/delivered/read for the
  // same wamid must not overwrite it and hide a real failure.
}

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Quote status endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { wa_message_id?: string; delivery_status?: string; timestamp?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const waMessageId = body.wa_message_id?.trim()
  const deliveryStatus = body.delivery_status?.trim()
  if (!waMessageId || !deliveryStatus || !(deliveryStatus in STATUS_RANK)) {
    return NextResponse.json({ error: 'wa_message_id and a valid delivery_status are required.' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: quote } = await admin
    .from('quotes')
    .select('id, delivery_status')
    .eq('wa_message_id', waMessageId)
    .maybeSingle()

  if (!quote) {
    // Expected for the vast majority of calls — not a quote wamid.
    return NextResponse.json({ success: true, matched: false })
  }

  const currentRank = quote.delivery_status ? STATUS_RANK[quote.delivery_status] ?? 0 : 0
  if (STATUS_RANK[deliveryStatus] <= currentRank) {
    return NextResponse.json({ success: true, matched: true, updated: false })
  }

  const timestampMs = body.timestamp ? Number(body.timestamp) * 1000 : Date.now()
  const { error } = await admin
    .from('quotes')
    .update({
      delivery_status: deliveryStatus,
      delivery_status_at: new Date(timestampMs).toISOString(),
    })
    .eq('id', quote.id)

  if (error) {
    console.error('[n8n/quote/status] update failed:', error)
    return NextResponse.json({ error: 'Failed to update quote status.' }, { status: 500 })
  }

  // Mirror onto the inbox message's ticks too (messages.status shares
  // the same 'sent'|'delivered'|'read'|'failed' vocabulary). Best
  // effort — the quotes-table update above is the source of truth.
  await admin
    .from('messages')
    .update({ status: deliveryStatus })
    .eq('message_id', waMessageId)

  return NextResponse.json({ success: true, matched: true, updated: true })
}
