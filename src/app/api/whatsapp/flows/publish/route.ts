import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { flow_id } = await request.json()
  if (!flow_id) return NextResponse.json({ error: 'flow_id required' }, { status: 400 })

  // Load flow definition
  const { data: flow, error: flowErr } = await supabase
    .from('whatsapp_flows')
    .select('*')
    .eq('id', flow_id)
    .single()
  if (flowErr || !flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 })

  // Load WA config for this account
  const { data: config, error: cfgErr } = await supabase
    .from('whatsapp_config')
    .select('waba_id, access_token, phone_number_id')
    .eq('account_id', flow.account_id)
    .single()
  if (cfgErr || !config?.waba_id) {
    return NextResponse.json({ error: 'WhatsApp not configured or WABA ID missing' }, { status: 400 })
  }

  const token = decrypt(config.access_token)
  const wabaId = config.waba_id

  // 1. Create flow on Meta
  const createRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/flows`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: flow.name,
      categories: ['APPOINTMENT_BOOKING'],
    }),
  })
  const createJson = await createRes.json()
  if (!createRes.ok || !createJson.id) {
    return NextResponse.json({ error: createJson.error?.message ?? 'Failed to create flow on Meta' }, { status: 500 })
  }
  const metaFlowId = createJson.id as string

  // 2. Upload flow JSON asset
  const formData = new FormData()
  const flowJson = JSON.stringify({
    version: '3.0',
    screens: (flow.definition as { screens: unknown[] }).screens,
  })
  formData.append('file', new Blob([flowJson], { type: 'application/json' }), 'flow.json')
  formData.append('name', 'flow.json')
  formData.append('asset_type', 'FLOW_JSON')

  const assetRes = await fetch(`https://graph.facebook.com/v19.0/${metaFlowId}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const assetJson = await assetRes.json()
  if (!assetRes.ok) {
    return NextResponse.json({ error: assetJson.error?.message ?? 'Failed to upload flow JSON', validation_errors: assetJson.validation_errors }, { status: 500 })
  }

  // 3. Publish flow
  const pubRes = await fetch(`https://graph.facebook.com/v19.0/${metaFlowId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publish: true }),
  })
  const pubJson = await pubRes.json()
  // publish failure is non-fatal — flow is still usable as draft
  const published = pubRes.ok && pubJson.success === true

  // 4. Save meta_flow_id + status
  await supabase
    .from('whatsapp_flows')
    .update({ meta_flow_id: metaFlowId, status: published ? 'published' : 'draft', updated_at: new Date().toISOString() })
    .eq('id', flow_id)

  return NextResponse.json({ meta_flow_id: metaFlowId, published })
}
