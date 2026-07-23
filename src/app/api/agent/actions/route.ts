import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/agent/actions — the Daily Agent's current draft queue for
// the caller's account (RLS-scoped via the caller's own session).
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('agent_actions')
      .select('id, kind, reason, drafted_text, status, error, created_at, lead:leads(customer_name, customer_phone)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ actions: data ?? [] })
  } catch (err) {
    console.error('[agent/actions GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
