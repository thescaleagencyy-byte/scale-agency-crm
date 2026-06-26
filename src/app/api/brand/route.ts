import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('id', user.id).single()
  if (!profile?.account_id) return NextResponse.json(null)

  const { data } = await supabase.from('brand_config').select('*').eq('account_id', profile.account_id).maybeSingle()
  return NextResponse.json(data ?? null)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const body = await request.json()
  const { app_name, logo_url, primary_hex, support_email } = body

  const { data, error } = await supabase
    .from('brand_config')
    .upsert({
      account_id: profile.account_id,
      app_name: app_name || null,
      logo_url: logo_url || null,
      primary_hex: primary_hex || null,
      support_email: support_email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
