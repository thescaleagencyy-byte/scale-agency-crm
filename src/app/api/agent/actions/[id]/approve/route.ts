import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { engineSendText } from '@/lib/automations/meta-send'

// POST /api/agent/actions/[id]/approve — the only path that actually
// sends a Daily Agent draft to a real customer. Human clicked
// Approve; send via the same Meta sender the rest of the app uses,
// then mark the row sent/failed with the real error either way.
//
// Approving is a real send, not a read — gated at 'agent' or above
// (see canSendMessages() in lib/auth/roles.ts) so a read-only viewer
// can't approve a draft into a real outbound message. engineSendText
// runs as service-role internally, so this app-layer check is the
// only gate — RLS on agent_actions alone isn't enough here.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    let userId: string
    let accountId: string
    let supabase: Awaited<ReturnType<typeof requireRole>>['supabase']
    try {
      const ctx = await requireRole('agent')
      userId = ctx.userId
      accountId = ctx.accountId
      supabase = ctx.supabase
    } catch (err) {
      return toErrorResponse(err)
    }

    const { data: action, error: fetchErr } = await supabase
      .from('agent_actions')
      .select('id, account_id, contact_id, conversation_id, drafted_text, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .single()
    if (fetchErr || !action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })
    if (action.status !== 'draft') return NextResponse.json({ error: `Already ${action.status}` }, { status: 400 })
    if (!action.contact_id || !action.conversation_id) {
      return NextResponse.json({ error: 'Missing contact or conversation — cannot send' }, { status: 400 })
    }

    try {
      await engineSendText({
        accountId: action.account_id,
        userId,
        conversationId: action.conversation_id,
        contactId: action.contact_id,
        text: action.drafted_text,
      })
      await supabase.from('agent_actions').update({
        status: 'sent',
        actioned_at: new Date().toISOString(),
        actioned_by: userId,
        error: null,
      }).eq('id', id)
      return NextResponse.json({ ok: true })
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : 'Send failed'
      await supabase.from('agent_actions').update({
        status: 'failed',
        actioned_at: new Date().toISOString(),
        actioned_by: userId,
        error: message,
      }).eq('id', id)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (err) {
    console.error('[agent/actions/approve POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
