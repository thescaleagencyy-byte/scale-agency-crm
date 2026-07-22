import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptText } from '@/lib/crypto'
import { INTEGRATIONS_CATALOG } from '@/lib/integrations-catalog'

// POST /api/integrations/connect — store a pasted credential,
// encrypted, for a service that doesn't have a real OAuth flow wired
// yet. Status is set to 'pending', not 'connected' — this endpoint
// has no way to verify the credential actually works against the
// real provider API, and claiming "connected" without proof would be
// exactly the kind of thing this whole session has been fixing.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as { service?: unknown; credential?: unknown; notes?: unknown } | null
    const service = typeof body?.service === 'string' ? body.service : ''
    const credential = typeof body?.credential === 'string' ? body.credential.trim() : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
    if (!INTEGRATIONS_CATALOG.some((d) => d.service === service && !d.managedElsewhere)) {
      return NextResponse.json({ error: 'Unknown or unsupported service' }, { status: 400 })
    }
    if (!credential) return NextResponse.json({ error: 'Credential required' }, { status: 400 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

    const { error } = await supabase.from('integrations').upsert(
      {
        account_id: profile.account_id,
        service,
        status: 'pending',
        credentials_encrypted: encryptText(credential),
        config: notes ? { notes } : null,
        last_checked_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,service' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[integrations/connect POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
