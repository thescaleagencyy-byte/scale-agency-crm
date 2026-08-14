import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { composeDigest } from '@/lib/digest/compose'
import { checkCronAuth } from '@/lib/cron-auth'

// GET /api/digest/cron — generates + stores today's digest for every
// account. Protect with DIGEST_CRON_SECRET (x-cron-secret header or
// ?secret= query param), same convention as /api/recovery/cron.
//
// WhatsApp delivery is NOT implemented here — sending a business-
// initiated message to the account owner's own number needs a Meta-
// approved message template (outside the 24h customer-reply window,
// same rule /api/recovery/cron already works around for customer
// sends) and a place to store which number is "the owner" to notify,
// neither of which exist yet. This generates and stores the digest
// so it's visible in-app; delivery is the next real step once a
// template exists.
export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'DIGEST_CRON_SECRET')
  if (authError) return authError

  const admin = supabaseAdmin()
  const { data: accounts, error } = await admin.from('accounts').select('id, default_currency')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let generated = 0
  const errors: string[] = []

  for (const account of accounts ?? []) {
    try {
      const { content, stats } = await composeDigest(admin, account.id, account.default_currency ?? 'PKR')
      const { error: insertErr } = await admin
        .from('daily_digests')
        .insert({ account_id: account.id, content, stats })
      if (insertErr) errors.push(`${account.id}: ${insertErr.message}`)
      else generated += 1
    } catch (e) {
      errors.push(`${account.id}: ${String(e)}`)
    }
  }

  return NextResponse.json({ generated, total: accounts?.length ?? 0, errors })
}
