import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { verifyUnsubscribeToken } from '@/lib/outreach/unsubscribe-token'

// GET /api/outreach/unsubscribe?p=<prospect_id>&e=<email>&t=<token>
//
// Public, unauthenticated — a recipient clicking this link from their
// inbox has no session. The signed token (see unsubscribe-token.ts)
// is what proves this request is legitimate, not auth. Uses the
// service-role client since there's no logged-in user to scope RLS to.
function html(body: string) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222">${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const prospectId = url.searchParams.get('p')
  const email = url.searchParams.get('e')
  const token = url.searchParams.get('t')

  if (!prospectId || !email || !token || !verifyUnsubscribeToken(prospectId, email, token)) {
    return html('<h2>Invalid or expired unsubscribe link.</h2>')
  }

  const admin = supabaseAdmin()
  const { data: prospect } = await admin
    .from('outreach_prospects')
    .select('id, account_id, email')
    .eq('id', prospectId)
    .maybeSingle()

  if (!prospect || prospect.email.toLowerCase() !== email.toLowerCase()) {
    return html('<h2>Invalid or expired unsubscribe link.</h2>')
  }

  await admin.from('outreach_suppressions').upsert(
    { account_id: prospect.account_id, email: prospect.email.toLowerCase(), reason: 'unsubscribed' },
    { onConflict: 'account_id,email' },
  )
  await admin.from('outreach_prospects').update({ status: 'unsubscribed' }).eq('id', prospect.id)
  await admin
    .from('outreach_enrollments')
    .update({ status: 'unsubscribed' })
    .eq('prospect_id', prospect.id)
    .eq('status', 'active')

  return html("<h2>You've been unsubscribed.</h2><p>You won't receive further emails from us.</p>")
}
