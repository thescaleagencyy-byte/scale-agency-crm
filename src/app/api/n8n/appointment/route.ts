import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

/**
 * POST /api/n8n/appointment
 *
 * Creates a placeholder appointment from a bot-collected meeting
 * request. The customer's day/time preference is free text (a WhatsApp
 * reply like "Tuesday afternoon"), not a real calendar slot — parsing
 * that reliably isn't worth the fragility, so this books a fixed
 * next-business-day 11:00 AM PKT placeholder slot and puts the
 * customer's raw preference in the appointment notes so whoever
 * confirms it knows what to actually offer.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   phone_number    string  — the customer's phone
 *   phone_number_id string  — WABA phone_number_id, resolves tenant
 *   preferred_text  string  — customer's raw day/time preference
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

  let body: { phone_number?: string; phone_number_id?: string; preferred_text?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.phone_number?.trim()) {
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }
  if (!body.phone_number_id?.trim()) {
    return NextResponse.json({ error: 'phone_number_id is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  const { data: configRows, error: configError } = await admin
    .from('whatsapp_config')
    .select('account_id, user_id')
    .eq('phone_number_id', body.phone_number_id.trim())
    .eq('status', 'connected')
  if (configError) {
    console.error('[n8n/appointment] config fetch failed:', configError)
    return NextResponse.json({ error: 'Failed to resolve account.' }, { status: 500 })
  }
  if (!configRows?.length) {
    return NextResponse.json({ error: 'No connected WhatsApp config for phone_number_id.' }, { status: 404 })
  }
  if (configRows.length > 1) {
    return NextResponse.json({ error: 'Ambiguous account for phone_number_id.' }, { status: 409 })
  }
  const { account_id: accountId } = configRows[0]

  const normalizedPhone = normalizePhone(body.phone_number.trim())
  const contact = await findExistingContact(admin, accountId, normalizedPhone).catch(() => null)
  if (!contact) {
    return NextResponse.json({ error: 'No contact found for this phone number.' }, { status: 404 })
  }

  // Next business day (Mon-Fri), 11:00 AM PKT (UTC+5) — a placeholder
  // slot for the team to actually confirm against the customer's
  // stated preference, not a real booking commitment yet.
  const startAt = new Date()
  startAt.setUTCDate(startAt.getUTCDate() + 1)
  while (startAt.getUTCDay() === 0 || startAt.getUTCDay() === 6) {
    startAt.setUTCDate(startAt.getUTCDate() + 1)
  }
  startAt.setUTCHours(6, 0, 0, 0) // 11:00 AM PKT = 06:00 UTC
  const endAt = new Date(startAt.getTime() + 30 * 60 * 1000)

  const { data: slot, error: slotError } = await admin
    .from('booking_slots')
    .insert({ account_id: accountId, start_at: startAt.toISOString(), end_at: endAt.toISOString() })
    .select('id')
    .single()
  if (slotError || !slot) {
    console.error('[n8n/appointment] slot insert failed:', slotError)
    return NextResponse.json({ error: 'Failed to create slot.' }, { status: 500 })
  }

  const preferredText = body.preferred_text?.trim() || 'Not specified'
  const { data: appointment, error: apptError } = await admin
    .from('appointments')
    .insert({
      account_id: accountId,
      slot_id: slot.id,
      contact_id: contact.id,
      status: 'pending',
      notes: `Customer's preferred day/time (from WhatsApp bot): ${preferredText}`,
    })
    .select('id')
    .single()
  if (apptError || !appointment) {
    console.error('[n8n/appointment] appointment insert failed:', apptError)
    return NextResponse.json({ error: 'Failed to create appointment.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, appointment_id: appointment.id })
}
