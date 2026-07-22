import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { composeDigest } from '@/lib/digest/compose'

// POST /api/digest/generate — on-demand digest for the caller's own
// account (RLS-scoped). The cron sweep at /api/digest/cron does this
// for every account on a schedule; this route exists so "generate
// now" works in the UI without waiting for the next cron tick.
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account:accounts(default_currency)')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

    const account = Array.isArray(profile.account) ? profile.account[0] : profile.account
    const currency = (account as { default_currency?: string } | null)?.default_currency ?? 'PKR'

    const { content, stats } = await composeDigest(supabase, profile.account_id, currency)

    const { data: row, error } = await supabase
      .from('daily_digests')
      .insert({ account_id: profile.account_id, content, stats })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ digest: row })
  } catch (err) {
    console.error('[digest/generate POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
