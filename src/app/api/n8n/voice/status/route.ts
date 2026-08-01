import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * GET /api/n8n/voice/status
 *
 * Kill switch for the AshWheelz voice agent, same pattern as
 * /api/n8n/quote/automation-status. Not wired to an enforcement point
 * yet — there's no phone number attached to the Vapi assistant yet,
 * so there's no inbound call flow to gate before it reaches the
 * assistant. Once a number exists, point Vapi's phone number
 * "assistant-request" server webhook at an n8n workflow that checks
 * this first and returns a fallback message if enabled=false.
 *
 * Fail-open by design, same reasoning as the quote kill switch: an
 * infra hiccup here must never silently block a real customer call.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 */
export async function GET(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ enabled: true, reason: 'auth_skipped' })
  }

  try {
    const admin = supabaseAdmin()

    const { data: configs } = await admin
      .from('whatsapp_config')
      .select('account_id, updated_at, created_at')
      .eq('status', 'connected')
    if (!configs?.length) {
      return NextResponse.json({ enabled: true, reason: 'no_account' })
    }
    configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))
    const accountId = configs[0].account_id

    const { data: control } = await admin
      .from('voice_agent_control')
      .select('enabled')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!control) {
      return NextResponse.json({ enabled: true, reason: 'no_row' })
    }
    return NextResponse.json({ enabled: control.enabled })
  } catch (e) {
    console.error('[n8n/voice/status] check failed:', e)
    return NextResponse.json({ enabled: true, reason: 'error' })
  }
}
