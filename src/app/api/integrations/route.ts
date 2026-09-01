import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { INTEGRATIONS_CATALOG } from '@/lib/integrations-catalog'
import { hasFeature } from '@/lib/features'

// GET /api/integrations — real status per service for the caller's
// account. WhatsApp/n8n status comes from their existing real config
// tables; everything else comes from the new `integrations` table.
// Nothing is ever reported "connected" without a real row proving it.
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

    const [whatsappRes, n8nRes, integrationsRes] = await Promise.all([
      supabase.from('whatsapp_config').select('status').eq('account_id', profile.account_id).maybeSingle(),
      supabase.from('n8n_config').select('id').eq('account_id', profile.account_id).maybeSingle(),
      supabase
        .from('integrations')
        .select('service, status, connected_at, last_checked_at, last_error')
        .eq('account_id', profile.account_id),
    ])

    const rowByService = new Map((integrationsRes.data ?? []).map((r) => [r.service, r]))

    const result = INTEGRATIONS_CATALOG
      .filter((def) => !def.featureKey || hasFeature(def.featureKey))
      .map((def) => {
      if (def.service === 'whatsapp') {
        return { ...def, status: whatsappRes.data?.status === 'connected' ? 'connected' : 'not_connected', connected_at: null, last_error: null }
      }
      if (def.service === 'n8n') {
        return { ...def, status: n8nRes.data ? 'connected' : 'not_connected', connected_at: null, last_error: null }
      }
      const row = rowByService.get(def.service)
      return {
        ...def,
        status: row?.status ?? 'not_connected',
        connected_at: row?.connected_at ?? null,
        last_error: row?.last_error ?? null,
      }
    })

    return NextResponse.json({ integrations: result })
  } catch (err) {
    console.error('[integrations GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
