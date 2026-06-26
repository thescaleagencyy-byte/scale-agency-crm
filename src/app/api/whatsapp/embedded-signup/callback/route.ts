import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/whatsapp/encryption'

/**
 * POST /api/whatsapp/embedded-signup/callback
 *
 * Receives the short-lived code from the Meta Embedded Signup FB.login()
 * callback, exchanges it for a long-lived System User access token, then
 * fetches the WABA + phone number and saves everything to whatsapp_config.
 *
 * Requires env vars:
 *   NEXT_PUBLIC_META_APP_ID    — Meta App ID (public, used in the SDK init)
 *   META_APP_SECRET            — Meta App Secret (server-only)
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await request.json()
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'META_APP_ID / META_APP_SECRET not configured on server' }, { status: 500 })
  }

  // 1. Exchange short-lived code for long-lived token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`,
  )
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.json({ error: tokenJson.error?.message ?? 'Token exchange failed' }, { status: 500 })
  }
  const accessToken: string = tokenJson.access_token

  // 2. Fetch WABA subscribed phone numbers
  const wabaRes = await fetch(
    `https://graph.facebook.com/v19.0/me/businesses?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${accessToken}`,
  )
  const wabaJson = await wabaRes.json()

  let wabaId: string | null = null
  let phoneNumberId: string | null = null
  let displayPhone: string | null = null
  let verifiedName: string | null = null

  // Walk the nested structure to pull the first phone number
  const businesses: Array<{ whatsapp_business_accounts?: { data?: Array<{ id: string; phone_numbers?: { data?: Array<{ id: string; display_phone_number: string; verified_name: string }> } }> } }> = wabaJson.data ?? []
  outer: for (const biz of businesses) {
    for (const waba of biz.whatsapp_business_accounts?.data ?? []) {
      wabaId = waba.id
      const phones = waba.phone_numbers?.data ?? []
      if (phones.length > 0) {
        phoneNumberId = phones[0].id
        displayPhone = phones[0].display_phone_number
        verifiedName = phones[0].verified_name
        break outer
      }
    }
  }

  if (!wabaId || !phoneNumberId) {
    return NextResponse.json({ error: 'No WhatsApp Business phone number found. Make sure your WABA has at least one registered number.' }, { status: 400 })
  }

  // 3. Register webhook on the phone number
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? 'crm-verify-token'

  await fetch(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks'] }),
  })

  // 4. Get account_id from profile
  const { data: profile } = await supabase.from('profiles').select('account_id').eq('id', user.id).single()
  if (!profile?.account_id) return NextResponse.json({ error: 'No account found' }, { status: 400 })

  // 5. Upsert whatsapp_config
  const encryptedToken = encrypt(accessToken)
  const { error } = await supabase
    .from('whatsapp_config')
    .upsert({
      account_id: profile.account_id,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token: encryptedToken,
      verify_token: verifyToken,
      webhook_url: webhookUrl,
      status: 'active',
      display_phone_number: displayPhone,
      registered_at: new Date().toISOString(),
    }, { onConflict: 'account_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    display_phone_number: displayPhone,
    verified_name: verifiedName,
  })
}
