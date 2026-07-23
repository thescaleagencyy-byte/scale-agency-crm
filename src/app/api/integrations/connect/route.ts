import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptText } from '@/lib/crypto'
import { INTEGRATIONS_CATALOG } from '@/lib/integrations-catalog'
import { VERIFIERS } from '@/lib/integration-verify'

// POST /api/integrations/connect — store a pasted credential,
// encrypted. For services with a real live-verify check (Stripe,
// Shopify, WooCommerce, Slack, Facebook/Instagram — see
// integration-verify.ts) this makes a real read-only call against
// the provider's API and only marks 'connected' if it succeeds,
// 'error' with the real reason if it doesn't. Services without a
// verifier (need an OAuth app we don't own yet) stay 'pending' —
// honest, not broken.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as
      | { service?: unknown; fields?: unknown; credential?: unknown; notes?: unknown }
      | null
    const service = typeof body?.service === 'string' ? body.service : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''

    const def = INTEGRATIONS_CATALOG.find((d) => d.service === service && !d.managedElsewhere)
    if (!def) return NextResponse.json({ error: 'Unknown or unsupported service' }, { status: 400 })

    // Multi-field services (credentialFields set) submit { fields }; the
    // legacy single-blob services still submit { credential }.
    let fields: Record<string, string> = {}
    if (def.credentialFields) {
      const raw = body?.fields
      if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Missing credential fields' }, { status: 400 })
      for (const f of def.credentialFields) {
        const v = (raw as Record<string, unknown>)[f.key]
        if (typeof v !== 'string' || !v.trim()) return NextResponse.json({ error: `${f.label} is required` }, { status: 400 })
        fields[f.key] = v.trim()
      }
    } else {
      const credential = typeof body?.credential === 'string' ? body.credential.trim() : ''
      if (!credential) return NextResponse.json({ error: 'Credential required' }, { status: 400 })
      fields = { credential }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

    const hasVerifier = Object.prototype.hasOwnProperty.call(VERIFIERS, service)
    const verifier = VERIFIERS[service]
    let status: 'pending' | 'connected' | 'error' = 'pending'
    let lastError: string | null = null
    let meta: Record<string, unknown> | undefined
    if (hasVerifier) {
      const result = await verifier(fields)
      status = result.ok ? 'connected' : 'error'
      lastError = result.ok ? null : (result.error ?? 'Verification failed')
      meta = result.meta
    }

    const { error } = await supabase.from('integrations').upsert(
      {
        account_id: profile.account_id,
        service,
        status,
        credentials_encrypted: encryptText(JSON.stringify(fields)),
        config: { ...(notes ? { notes } : {}), ...(meta ?? {}) },
        connected_at: status === 'connected' ? new Date().toISOString() : null,
        last_checked_at: hasVerifier ? new Date().toISOString() : null,
        last_error: lastError,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,service' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, status, error: lastError })
  } catch (err) {
    console.error('[integrations/connect POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
