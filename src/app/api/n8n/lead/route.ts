import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { scoreLead } from '@/lib/leads/score'

/**
 * POST /api/n8n/lead
 *
 * Called by n8n when [HANDOFF_READY] fires. Stores qualified lead in DB.
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   phone_number_id string  — WABA phone_number_id the n8n workflow is bound to; resolves tenant
 *   customer_phone  string  — recipient phone
 *   customer_name   string? — name from WhatsApp profile
 *   service_type    string? — equipment/service needed
 *   project_site    string? — city/location
 *   duration        string? — rental period
 *   quantity        string? — units
 *   company         string? — company name
 *   raw_handoff     string? — full [HANDOFF_READY:...] string
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Lead endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    phone_number_id?: string
    customer_phone?: string
    customer_name?: string
    service_type?: string
    project_site?: string
    duration?: string
    quantity?: string
    company?: string
    raw_handoff?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.customer_phone?.trim()) {
    return NextResponse.json({ error: 'customer_phone is required' }, { status: 400 })
  }
  if (!body.phone_number_id?.trim()) {
    return NextResponse.json({ error: 'phone_number_id is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Resolve account by the WABA phone_number_id the sending bot is bound to —
  // same tenancy key /api/whatsapp/webhook uses. Picking "most recently
  // updated connected config" instead would let any client's config touch
  // (reconnect, token refresh) silently steal another tenant's leads.
  const { data: configRows, error: configError } = await admin
    .from('whatsapp_config')
    .select('account_id')
    .eq('phone_number_id', body.phone_number_id.trim())
    .eq('status', 'connected')

  if (configError) {
    console.error('[n8n/lead] config fetch failed:', configError)
    return NextResponse.json({ error: 'Failed to resolve account.' }, { status: 500 })
  }
  if (!configRows?.length) {
    return NextResponse.json({ error: 'No connected WhatsApp config for phone_number_id.' }, { status: 404 })
  }
  if (configRows.length > 1) {
    console.error('[n8n/lead] multiple configs for phone_number_id:', body.phone_number_id, configRows)
    return NextResponse.json({ error: 'Ambiguous account for phone_number_id.' }, { status: 409 })
  }
  const accountId = configRows[0].account_id

  // Resolve contact + conversation IDs (best-effort, don't block on failure)
  const normalizedPhone = normalizePhone(body.customer_phone.trim())
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
  }

  const leadFields = {
    customer_name: body.customer_name?.trim() || null,
    service_type: body.service_type?.trim() || null,
    project_site: body.project_site?.trim() || null,
    duration: body.duration?.trim() || null,
    quantity: body.quantity?.trim() || null,
    company: body.company?.trim() || null,
  }
  const { score, factors } = scoreLead(leadFields)

  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      account_id: accountId,
      ...leadFields,
      customer_phone: normalizedPhone,
      raw_handoff: body.raw_handoff?.trim() || null,
      contact_id: contact?.id ?? null,
      conversation_id: conversationId,
      status: 'new',
      score,
      score_factors: factors,
    })
    .select()
    .single()

  if (error) {
    console.error('[n8n/lead] DB insert failed:', error)
    return NextResponse.json({ error: 'Failed to save lead.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, lead_id: lead.id })
}
