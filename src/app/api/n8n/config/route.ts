import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import { supabaseAdmin } from '@/lib/flows/admin-client'

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

    const { data, error } = await supabase
      .from('n8n_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to load config' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ config: null })
    }

    // Never expose the raw encrypted key — just signal it exists
    return NextResponse.json({
      config: {
        id: data.id,
        account_id: data.account_id,
        webhook_url: data.webhook_url ?? null,
        api_url: data.api_url ?? null,
        has_api_key: !!data.api_key,
        updated_at: data.updated_at,
      },
    })
  } catch (err) {
    console.error('[n8n/config GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const { webhook_url, api_url, api_key } = body

    const { data: existing } = await supabase
      .from('n8n_config')
      .select('id, api_key')
      .eq('account_id', accountId)
      .maybeSingle()

    // Encrypt the API key only when a new one is provided
    let encryptedApiKey: string | null = existing?.api_key ?? null
    if (api_key && api_key.trim()) {
      try {
        encryptedApiKey = encrypt(api_key.trim())
      } catch (err) {
        console.error('[n8n/config POST] encryption failed:', err)
        return NextResponse.json({ error: 'Failed to encrypt API key' }, { status: 500 })
      }
    }

    const row = {
      webhook_url: webhook_url?.trim() || null,
      api_url: api_url?.trim() || null,
      api_key: encryptedApiKey,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error } = await supabase
        .from('n8n_config')
        .update(row)
        .eq('account_id', accountId)
      if (error) {
        return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
      }
    } else {
      const { error } = await supabase
        .from('n8n_config')
        .insert({ account_id: accountId, ...row })
      if (error) {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[n8n/config POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
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

    const { error } = await supabase
      .from('n8n_config')
      .delete()
      .eq('account_id', accountId)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[n8n/config DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Exported for use by the webhook forwarder — fetches all n8n webhook
 * URLs across all accounts without an auth check (server-only).
 */
export async function getAllN8nWebhookUrls(): Promise<string[]> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('n8n_config')
    .select('webhook_url')
    .not('webhook_url', 'is', null)
  if (error || !data) return []
  return data.map((r: { webhook_url: string }) => r.webhook_url).filter(Boolean)
}

/**
 * Exported for use by the executions proxy — decrypts and returns
 * the n8n api_url + api_key for a given account.
 */
export async function getN8nApiCredentials(
  accountId: string,
): Promise<{ apiUrl: string; apiKey: string } | null> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('n8n_config')
    .select('api_url, api_key')
    .eq('account_id', accountId)
    .maybeSingle()
  if (error || !data?.api_url || !data?.api_key) return null
  try {
    const apiKey = decrypt(data.api_key)
    return { apiUrl: data.api_url.replace(/\/$/, ''), apiKey }
  } catch {
    return null
  }
}
