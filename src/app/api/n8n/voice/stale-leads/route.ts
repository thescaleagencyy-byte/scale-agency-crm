import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * GET /api/n8n/voice/stale-leads
 *
 * SLA watchdog for the voice agent: returns voice-sourced leads still
 * status='new' after an hour with nobody having claimed them, and
 * marks them sla_alert_sent so the next poll doesn't re-page Umer for
 * the same lead. This is a read-and-mark call, not a pure read — the
 * n8n Schedule Trigger workflow polling this is expected to alert on
 * whatever comes back, since a returned row here fires exactly once.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 */
export async function GET(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Stale-leads endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: staleLeads, error } = await admin
    .from('leads')
    .select('id, customer_name, customer_phone, service_type, project_site, duration, company, created_at')
    .eq('source', 'voice')
    .eq('status', 'new')
    .eq('sla_alert_sent', false)
    .lt('created_at', oneHourAgo)

  if (error) {
    console.error('[n8n/voice/stale-leads] query failed:', error)
    return NextResponse.json({ error: 'Failed to query stale leads.' }, { status: 500 })
  }

  if (!staleLeads?.length) {
    return NextResponse.json({ stale_leads: [] })
  }

  const ids = staleLeads.map((l) => l.id)
  const { error: updateError } = await admin
    .from('leads')
    .update({ sla_alert_sent: true })
    .in('id', ids)

  if (updateError) {
    console.error('[n8n/voice/stale-leads] mark-alerted failed:', updateError)
    // Still return the leads — better to risk a duplicate alert next
    // poll than to silently drop a real SLA breach because the mark
    // failed.
  }

  return NextResponse.json({ stale_leads: staleLeads })
}
