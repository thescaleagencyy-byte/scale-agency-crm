import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * GET /api/n8n/quote/automation-status
 *
 * Called by "AshWheelz Prime - Outlook Quote to WhatsApp" on every
 * trigger fire, before any email extraction happens. Lets Umer pause
 * the automation from the dashboard without touching n8n.
 *
 * Fail-open by design: any row-missing / DB / auth-misconfig case
 * returns enabled:true. This is a manual kill switch, not a health
 * gate — an infra hiccup here must never silently stop paid customer
 * quote sends. Only an explicit enabled:false row stops the workflow.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var
 * (same key as /api/n8n/quote).
 */

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    // Fail-open: unauthorized/misconfigured must not block sends.
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
      .from('quote_automation_control')
      .select('enabled')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!control) {
      return NextResponse.json({ enabled: true, reason: 'no_row' })
    }
    return NextResponse.json({ enabled: control.enabled })
  } catch (e) {
    console.error('[n8n/quote/automation-status] check failed:', e)
    return NextResponse.json({ enabled: true, reason: 'error' })
  }
}
