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

// Paginate n8n executions until we've collected everything since `sinceMs`.
// Stops early if we've fetched 500 records (safety cap).
async function fetchSince(
  apiUrl: string,
  apiKey: string,
  sinceMs: number,
): Promise<unknown[]> {
  const all: unknown[] = []
  let cursor: string | null = null

  while (all.length < 500) {
    const params = new URLSearchParams({ limit: '100' })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`${apiUrl}/api/v1/executions?${params}`, {
      headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) break

    const page = await res.json()
    const execs: Array<{ startedAt: string }> = page.data ?? []

    let hitOld = false
    for (const exec of execs) {
      if (new Date(exec.startedAt).getTime() < sinceMs) { hitOld = true; break }
      all.push(exec)
    }

    if (hitOld || !page.nextCursor) break
    cursor = page.nextCursor
  }

  return all
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)

    // Legacy single-page mode (limit param present, no mode=all)
    if (searchParams.has('limit') && !searchParams.has('mode')) {
      const limit = searchParams.get('limit') ?? '20'
      const status = searchParams.get('status')
      const params = new URLSearchParams({ limit })
      if (status) params.set('status', status)

      const res = await fetch(`${creds.apiUrl}/api/v1/executions?${params}`, {
        headers: { 'X-N8N-API-KEY': creds.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('[n8n/executions] n8n API error:', res.status, text)
        return NextResponse.json({ error: `n8n returned ${res.status}` }, { status: res.status })
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    // Default: fetch all executions since start of yesterday (today + yesterday)
    const now = new Date()
    const todayMidnight = new Date(now)
    todayMidnight.setHours(0, 0, 0, 0)
    const yesterdayMidnight = new Date(todayMidnight)
    yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1)

    const execs = await fetchSince(creds.apiUrl, creds.apiKey, yesterdayMidnight.getTime())
    return NextResponse.json({ data: execs })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'n8n API timed out' }, { status: 504 })
    }
    console.error('[n8n/executions GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
