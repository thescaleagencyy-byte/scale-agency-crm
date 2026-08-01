import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

/**
 * POST /api/n8n/voice/contact-lookup
 *
 * Called by the voice agent at the start of a call so it can recognize
 * a repeat caller instead of treating every call as a stranger. POST
 * (not GET) because Vapi function tools always POST the tool-call
 * payload to server.url — there's no passthrough GET option.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body: { customer_phone: string }
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Contact lookup endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { customer_phone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.customer_phone?.trim()) {
    return NextResponse.json({ error: 'customer_phone is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: configs } = await admin
    .from('whatsapp_config')
    .select('account_id, updated_at, created_at')
    .eq('status', 'connected')
  if (!configs?.length) {
    return NextResponse.json({ found: false })
  }
  configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))
  const accountId = configs[0].account_id

  const normalizedPhone = normalizePhone(body.customer_phone.trim())
  const contact = await findExistingContact(admin, accountId, normalizedPhone).catch(() => null)

  if (!contact) {
    return NextResponse.json({ found: false })
  }

  const { data: recentLead } = await admin
    .from('leads')
    .select('service_type, project_site, company, status, created_at')
    .eq('account_id', accountId)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    found: true,
    name: contact.name ?? null,
    recent_request: recentLead
      ? {
          service_type: recentLead.service_type,
          project_site: recentLead.project_site,
          company: recentLead.company,
          status: recentLead.status,
          when: recentLead.created_at,
        }
      : null,
  })
}
