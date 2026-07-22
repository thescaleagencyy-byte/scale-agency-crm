import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/digest/approve-stale-leads — the CEO Command Center's
// "Approve all" action for the digest's stale-lead section. One
// click creates a real follow-up reminder for every lead currently
// sitting 3+ days as status='new', instead of the owner reading the
// list and creating each reminder by hand (or asking the Copilot one
// at a time). Same table (follow_up_reminders) and same due-tomorrow
// default the create_reminder tool would use for each one.
export async function POST() {
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

    const { data: staleLeads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, customer_name, customer_phone')
      .eq('account_id', profile.account_id)
      .eq('status', 'new')
      .lt('created_at', new Date(Date.now() - 3 * 86400000).toISOString())
    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })
    if (!staleLeads || staleLeads.length === 0) {
      return NextResponse.json({ created: 0, message: 'No stale leads right now.' })
    }

    const dueAt = new Date()
    dueAt.setDate(dueAt.getDate() + 1)

    const { error: insertErr } = await supabase.from('follow_up_reminders').insert(
      staleLeads.map((lead) => ({
        account_id: profile.account_id,
        user_id: user.id,
        entity_type: 'lead' as const,
        entity_id: lead.id,
        due_at: dueAt.toISOString(),
        note: `Going cold — no contact in 3+ days (${lead.customer_name ?? lead.customer_phone})`,
      })),
    )
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({ created: staleLeads.length })
  } catch (err) {
    console.error('[digest/approve-stale-leads POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
