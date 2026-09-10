import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { scoreLead } from '@/lib/leads/score'
import { triageLead } from '@/lib/leads/triage'
import { parseToolRequest, isUsablePhone, str, toolResponse } from '@/lib/voice/tool-payload'

/**
 * POST /api/n8n/lead
 *
 * Called by n8n when [HANDOFF_READY] fires. Stores qualified lead in DB.
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   account_id      string? — account UUID; resolves tenant (what the voice agent and
 *                             /api/n8n/send use). Either this or phone_number_id is required.
 *   phone_number_id string? — WABA phone_number_id the n8n workflow is bound to; resolves tenant
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

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Accepts both the flat n8n body and Vapi's { message: { toolCalls: [...] } } wrapper.
  const { args, toolCallId, callerPhone } = parseToolRequest(raw)
  const fail = (error: string, status: number) =>
    NextResponse.json(toolResponse(toolCallId, { error }), { status })

  const body = {
    account_id: str(args, 'account_id'),
    phone_number_id: str(args, 'phone_number_id'),
    customer_phone: str(args, 'customer_phone'),
    customer_name: str(args, 'customer_name'),
    service_type: str(args, 'service_type'),
    project_site: str(args, 'project_site'),
    duration: str(args, 'duration'),
    start_date: str(args, 'start_date'),
    quantity: str(args, 'quantity'),
    company: str(args, 'company'),
    raw_handoff: str(args, 'raw_handoff'),
  }

  // Caller ID from the telephony layer beats anything the model typed: on voice
  // calls the model has been known to emit a literal "{{customer.number}}" or
  // invent a plausible-looking Saudi number.
  const phone = callerPhone ?? (isUsablePhone(body.customer_phone) ? body.customer_phone : null)
  if (!phone) {
    return fail('customer_phone is required', 400)
  }

  // Tenancy key. account_id is what /api/n8n/send and the voice tool send;
  // phone_number_id is what the WhatsApp workflow sends. Never fall back to
  // "most recently updated config" — that leaks leads across clients.
  const tenantAccountId = body.account_id ?? request.headers.get('x-account-id')?.trim() ?? null
  if (!tenantAccountId && !body.phone_number_id) {
    return fail('account_id or phone_number_id is required', 400)
  }

  const admin = supabaseAdmin()

  // Resolve account by the WABA phone_number_id the sending bot is bound to —
  // same tenancy key /api/whatsapp/webhook uses. Picking "most recently
  // updated connected config" instead would let any client's config touch
  // (reconnect, token refresh) silently steal another tenant's leads.
  const configQuery = admin.from('whatsapp_config').select('account_id').eq('status', 'connected')
  const { data: configRows, error: configError } = await (tenantAccountId
    ? configQuery.eq('account_id', tenantAccountId)
    : configQuery.eq('phone_number_id', body.phone_number_id!))

  if (configError) {
    console.error('[n8n/lead] config fetch failed:', configError)
    return fail('Failed to resolve account.', 500)
  }
  if (!configRows?.length) {
    return fail('No connected account for the supplied account_id/phone_number_id.', 404)
  }
  if (tenantAccountId === null && configRows.length > 1) {
    console.error('[n8n/lead] multiple configs for phone_number_id:', body.phone_number_id, configRows)
    return fail('Ambiguous account for phone_number_id.', 409)
  }
  const accountId = configRows[0].account_id

  // Resolve contact + conversation IDs (best-effort, don't block on failure)
  const normalizedPhone = normalizePhone(phone)
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
    customer_name: body.customer_name ?? null,
    service_type: body.service_type ?? null,
    project_site: body.project_site ?? null,
    duration: body.duration ?? null,
    quantity: body.quantity ?? null,
    company: body.company ?? null,
  }
  const { score, factors } = scoreLead(leadFields)

  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      account_id: accountId,
      ...leadFields,
      customer_phone: normalizedPhone,
      raw_handoff: [body.start_date ? `start_date=${body.start_date}` : null, body.raw_handoff ?? null]
        .filter(Boolean)
        .join(' | ') || null,
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
    return fail('Failed to save lead.', 500)
  }

  // Fire after the response so a slow/failed OpenAI call never delays or
  // breaks n8n's webhook delivery — the lead is already saved either way.
  // No-ops quietly if OPENAI_API_KEY isn't set (triageLead returns null).
  after(async () => {
    try {
      await triageLead(admin, lead)
    } catch (err) {
      console.error('[n8n/lead] auto-triage failed for', lead.id, err)
    }
  })

  return NextResponse.json(
    toolResponse(toolCallId, {
      success: true,
      lead_id: lead.id,
      result: 'Request logged for the ops team.',
    }),
  )
}
