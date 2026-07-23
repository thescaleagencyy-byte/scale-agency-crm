import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('agent_actions')
      .update({ status: 'rejected', actioned_at: new Date().toISOString(), actioned_by: user.id })
      .eq('id', id)
      .eq('status', 'draft')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[agent/actions/reject POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
