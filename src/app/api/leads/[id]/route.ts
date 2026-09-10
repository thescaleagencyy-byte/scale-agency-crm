// ============================================================
// /api/leads/[id]
//
//   DELETE — permanently remove a lead. Admin+.
//
// Leads had no delete path at all: no API route and no UI action,
// so a junk, duplicate, or test row could only be removed from the
// Supabase table editor. Scoped to the caller's own account so an
// admin can never delete another tenant's lead.
// ============================================================

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await params

    const admin = supabaseAdmin()

    // Match on account_id as well as id: without it, a valid lead id
    // from another tenant would delete successfully.
    const { data, error } = await admin
      .from('leads')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id')

    if (error) {
      console.error('[leads/[id]] delete failed:', error)
      return NextResponse.json({ error: 'Failed to delete lead.' }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, deleted: data[0].id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
