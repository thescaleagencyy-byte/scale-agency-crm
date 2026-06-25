import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

/**
 * POST /api/n8n/lead
 *
 * Called by n8n when [HANDOFF_READY] fires. Stores qualified lead in DB.
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
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

  const admin = supabaseAdmin()

  // Resolve account
  const { data: configs } = await admin
    .from('whatsapp_config')
    .select('account_id, updated_at, created_at')
    .eq('status', 'connected')
  if (!configs?.length) {
    return NextResponse.json({ error: 'No active WhatsApp config.' }, { status: 404 })
  }
  configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))
  const accountId = configs[0].account_id

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

  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      account_id: accountId,
      customer_name: body.customer_name?.trim() || null,
      customer_phone: normalizedPhone,
      service_type: body.service_type?.trim() || null,
      project_site: body.project_site?.trim() || null,
      duration: body.duration?.trim() || null,
      quantity: body.quantity?.trim() || null,
      company: body.company?.trim() || null,
      raw_handoff: body.raw_handoff?.trim() || null,
      contact_id: contact?.id ?? null,
      conversation_id: conversationId,
      status: 'new',
    })
    .select()
    .single()

  if (error) {
    console.error('[n8n/lead] DB insert failed:', error)
    return NextResponse.json({ error: 'Failed to save lead.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, lead_id: lead.id })
}
