import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getN8nApiCredentials } from '@/app/api/n8n/config/route'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// AR1/AR2/AR3 went live against AshWheelz's REAL Odoo on this date
// (confirmed in project history — `ar1_odoo_config` was switched from
// `testing_db_22_aug` to `ashwheelz_live_db` on 2026-09-28). Every row
// touched before this is leftover from pre-launch testing — fake
// accounts ("TEST Collections") and real-named test rows (Amina Noor,
// Zainab Rafaqat, Fizza Asghar, Asad Zahid, etc.) chased against a
// clone database, never cleaned out of this table the way the Odoo
// test data was. Filtering them out here so this dashboard only ever
// shows genuine production activity — the table itself still carries
// the old rows; that's a separate cleanup decision, not a view-layer one.
const AR_LIVE_SINCE = '2026-09-28'

// Pulls every row from the n8n Data Table that the AR Collections
// workflows (AR1/AR2/AR3) write to — one row per invoice they've
// chased, kept current (upserted), not appended daily. This is the
// real activity log: who got emailed, who got escalated, for how
// much, and when. Paginates until exhausted (safety cap 3000 rows —
// well above the live ~700 real rows as of 2026-09-29).
async function fetchAllRows(
  apiUrl: string,
  apiKey: string,
  tableId: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let cursor: string | null = null
  const filter = JSON.stringify({
    filters: [{ columnName: 'last_updated', condition: 'gte', value: AR_LIVE_SINCE }],
  })

  while (all.length < 3000) {
    const params = new URLSearchParams({ limit: '250', sortBy: 'last_updated:desc', filter })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`${apiUrl}/api/v1/data-tables/${tableId}/rows?${params}`, {
      headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) break

    const page = await res.json()
    const rows: Record<string, unknown>[] = page.data ?? []
    all.push(...rows)

    if (!page.nextCursor || rows.length === 0) break
    cursor = page.nextCursor
  }

  return all
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 403 })
    }

    const creds = await getN8nApiCredentials(accountId)
    if (!creds) {
      return NextResponse.json(
        { error: 'n8n API not configured. Add your n8n URL and API key in Settings → n8n.' },
        { status: 404 },
      )
    }

    const tableId = process.env.AR_TRACKER_TABLE_ID
    if (!tableId) {
      return NextResponse.json(
        { error: 'AR_TRACKER_TABLE_ID not configured for this deployment.' },
        { status: 404 },
      )
    }

    const rows = await fetchAllRows(creds.apiUrl, creds.apiKey, tableId)
    return NextResponse.json({ data: rows })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'n8n API timed out' }, { status: 504 })
    }
    console.error('[n8n/ar-tracker GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
