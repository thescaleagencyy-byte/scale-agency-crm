import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * GET /api/n8n/services
 *
 * Called by n8n so the WhatsApp bot only offers services the client
 * has marked available. Returns the catalog grouped by category:
 *
 *   { services: { "Truck Rentals": [{ name, spec, available }, …], … },
 *     available_text: "Truck Rentals: Dyna Trucks, Flatbed Trailers…" }
 *
 * `available_text` is a prompt-ready single string of ONLY the
 * available services, so a workflow can drop it straight into the
 * agent's system message without any Code-node assembly.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var
 * (same key the /api/n8n/send endpoint uses — one shared secret per
 * deployment). Single-tenant deployments have exactly one account,
 * so no account_id parameter is needed.
 */
export async function GET(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json(
      { error: 'n8n endpoint is not configured on this server.' },
      { status: 503 },
    )
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('client_services')
    .select('category, name, spec, available')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[n8n/services] fetch error:', error)
    return NextResponse.json({ error: 'Failed to load services' }, { status: 500 })
  }

  const services: Record<string, { name: string; spec: string | null; available: boolean }[]> = {}
  for (const row of data ?? []) {
    services[row.category] ??= []
    services[row.category].push({ name: row.name, spec: row.spec, available: row.available })
  }

  const available_text = Object.entries(services)
    .map(([cat, items]) => {
      const names = items.filter(i => i.available).map(i => i.name)
      return names.length ? `${cat}: ${names.join(', ')}` : null
    })
    .filter(Boolean)
    .join('\n')

  return NextResponse.json({ services, available_text })
}
