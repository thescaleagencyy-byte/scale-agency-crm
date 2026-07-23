import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { engineSendText } from '@/lib/automations/meta-send'

// POST /api/agent/actions/[id]/approve — the only path that actually
// sends a Daily Agent draft to a real customer. Human clicked
// Approve; send via the same Meta sender the rest of the app uses,
// then mark the row sent/failed with the real error either way.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

    const { data: action, error: fetchErr } = await supabase
      .from('agent_actions')
      .select('id, account_id, contact_id, conversation_id, drafted_text, status')
      .eq('id', id)
      .single()
    if (fetchErr || !action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })
    if (action.status !== 'draft') return NextResponse.json({ error: `Already ${action.status}` }, { status: 400 })
    if (!action.contact_id || !action.conversation_id) {
      return NextResponse.json({ error: 'Missing contact or conversation — cannot send' }, { status: 400 })
    }

    try {
      await engineSendText({
        accountId: action.account_id,
        userId: user.id,
        conversationId: action.conversation_id,
        contactId: action.contact_id,
        text: action.drafted_text,
      })
      await supabase.from('agent_actions').update({
        status: 'sent',
        actioned_at: new Date().toISOString(),
        actioned_by: user.id,
        error: null,
      }).eq('id', id)
      return NextResponse.json({ ok: true })
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : 'Send failed'
      await supabase.from('agent_actions').update({
        status: 'failed',
        actioned_at: new Date().toISOString(),
        actioned_by: user.id,
        error: message,
      }).eq('id', id)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (err) {
    console.error('[agent/actions/approve POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
