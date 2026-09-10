import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

/**
 * POST /api/n8n/voice/call-log
 *
 * Called by "AshWheelz Voice — Post-Call WhatsApp Confirmation" for
 * EVERY voice-agent call (whether or not it produced a lead) so the
 * dashboard's Voice Agent tab has a real call log, not just leads.
 * Upserts on (account_id, vapi_call_id) so a retried webhook delivery
 * doesn't double-insert the same call.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body: vapi_call_id (required), account_id (required - or x-account-id
 * header), customer_phone, customer_name,
 * call_type, language_used, resolved, escalated_to_ops, summary,
 * transcript, recording_url, ended_reason, duration_seconds, cost_usd,
 * started_at, ended_at — all optional besides vapi_call_id.
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Call-log endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    account_id?: string
    vapi_call_id?: string
    customer_phone?: string
    customer_name?: string
    call_type?: string
    language_used?: string
    resolved?: boolean
    escalated_to_ops?: boolean
    summary?: string
    transcript?: string
    recording_url?: string
    ended_reason?: string
    duration_seconds?: number
    cost_usd?: number
    started_at?: string
    ended_at?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.vapi_call_id?.trim()) {
    return NextResponse.json({ error: 'vapi_call_id is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Tenancy key. Same contract as /api/n8n/lead: the caller names its account.
  // Deliberately NO "most recent connected config" fallback - that resolves one
  // client's call log onto another client's account.
  const tenantAccountId =
    (body as { account_id?: string }).account_id?.trim() ||
    request.headers.get('x-account-id')?.trim() ||
    null
  if (!tenantAccountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  const { data: configs } = await admin
    .from('whatsapp_config')
    .select('account_id')
    .eq('status', 'connected')
    .eq('account_id', tenantAccountId)
    .limit(1)
  if (!configs?.length) {
    return NextResponse.json({ error: 'No connected account for the supplied account_id.' }, { status: 404 })
  }
  const accountId = configs[0].account_id

  let contactId: string | null = null
  if (body.customer_phone?.trim()) {
    const normalizedPhone = normalizePhone(body.customer_phone.trim())
    const contact = await findExistingContact(admin, accountId, normalizedPhone).catch(() => null)
    contactId = contact?.id ?? null
  }

  const { error } = await admin
    .from('voice_calls')
    .upsert(
      {
        account_id: accountId,
        vapi_call_id: body.vapi_call_id.trim(),
        contact_id: contactId,
        customer_phone: body.customer_phone?.trim() || null,
        customer_name: body.customer_name?.trim() || null,
        call_type: body.call_type?.trim() || null,
        language_used: body.language_used?.trim() || null,
        resolved: typeof body.resolved === 'boolean' ? body.resolved : null,
        escalated_to_ops: typeof body.escalated_to_ops === 'boolean' ? body.escalated_to_ops : null,
        summary: body.summary?.trim() || null,
        transcript: body.transcript?.trim() || null,
        recording_url: body.recording_url?.trim() || null,
        ended_reason: body.ended_reason?.trim() || null,
        duration_seconds: typeof body.duration_seconds === 'number' ? body.duration_seconds : null,
        cost_usd: typeof body.cost_usd === 'number' ? body.cost_usd : null,
        started_at: body.started_at || null,
        ended_at: body.ended_at || null,
      },
      { onConflict: 'account_id,vapi_call_id' },
    )

  if (error) {
    console.error('[n8n/voice/call-log] upsert failed:', error)
    return NextResponse.json({ error: 'Failed to log call.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
