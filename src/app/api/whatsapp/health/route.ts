import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single()

  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', profile.account_id)
    .single()

  if (!config) return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 })

  const token = decrypt(config.access_token)

  // Fetch quality rating from Meta Graph API
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${config.phone_number_id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name,name_status`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  const json = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: json.error?.message ?? 'Meta API error' }, { status: 500 })
  }

  const qualityRating: string = (json.quality_rating ?? 'UNKNOWN').toUpperCase()
  const tier: string = json.messaging_limit_tier ?? 'TIER_1K'

  // Store snapshot
  await supabase.from('wa_quality_history').insert({
    account_id: profile.account_id,
    quality_rating: ['GREEN', 'YELLOW', 'RED'].includes(qualityRating) ? qualityRating : 'UNKNOWN',
    messaging_limit_tier: tier,
  })

  return NextResponse.json({
    quality_rating: qualityRating,
    messaging_limit_tier: tier,
    display_phone_number: json.display_phone_number,
    verified_name: json.verified_name,
    name_status: json.name_status,
  })
}
