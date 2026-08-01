import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * GET /api/n8n/voice/config
 *
 * Gives the voice-agent n8n workflows (post-call WhatsApp confirmation,
 * SLA watchdog) the Meta phone_number_id to send from, since — unlike
 * the WhatsApp bot — there's no inbound Meta webhook payload to read it
 * from dynamically for a Vapi-triggered flow.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var
 * (same key as /api/n8n/lead and friends).
 */
export async function GET(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Voice config endpoint not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()

  const { data: configs } = await admin
    .from('whatsapp_config')
    .select('account_id, phone_number_id, updated_at, created_at')
    .eq('status', 'connected')
  if (!configs?.length) {
    return NextResponse.json({ error: 'No active WhatsApp config.' }, { status: 404 })
  }
  configs.sort((a, b) => ((b.updated_at ?? b.created_at) > (a.updated_at ?? a.created_at) ? 1 : -1))

  return NextResponse.json({
    phone_number_id: configs[0].phone_number_id,
    admin_alert_number: '923120000406',
  })
}
