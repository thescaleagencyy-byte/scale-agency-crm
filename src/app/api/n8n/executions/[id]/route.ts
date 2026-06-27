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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

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
      return NextResponse.json({ error: 'n8n not configured' }, { status: 404 })
    }

    const res = await fetch(
      `${creds.apiUrl}/api/v1/executions/${id}?includeData=true`,
      {
        headers: { 'X-N8N-API-KEY': creds.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      },
    )

    if (!res.ok) {
      return NextResponse.json({ error: `n8n returned ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'n8n API timed out' }, { status: 504 })
    }
    console.error('[n8n/executions/[id] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
