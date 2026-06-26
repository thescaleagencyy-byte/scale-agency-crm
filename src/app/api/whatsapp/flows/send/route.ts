import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { flow_id, contact_id, header_text, body_text, cta_text } = await request.json()
  if (!flow_id || !contact_id) return NextResponse.json({ error: 'flow_id and contact_id required' }, { status: 400 })

  const { data: flow } = await supabase.from('whatsapp_flows').select('*').eq('id', flow_id).single()
  if (!flow?.meta_flow_id) return NextResponse.json({ error: 'Flow not published to Meta yet' }, { status: 400 })

  const { data: contact } = await supabase.from('contacts').select('phone').eq('id', contact_id).single()
  if (!contact?.phone) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', flow.account_id)
    .single()
  if (!config) return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 })

  const token = decrypt(config.access_token)
  const to = contact.phone.replace(/\D/g, '')

  const firstScreenId = (flow.definition as { screens: Array<{ id: string }> }).screens?.[0]?.id ?? 'SCREEN_1'

  const msgRes = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: header_text || 'Book an Appointment' },
        body: { text: body_text || 'Fill out the form below to book your appointment.' },
        footer: { text: 'Powered by Scale Agency CRM' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: `booking_${flow_id}_${contact_id}_${Date.now()}`,
            flow_id: flow.meta_flow_id,
            flow_cta: cta_text || 'Book Now',
            flow_action: 'navigate',
            flow_action_payload: { screen: firstScreenId },
          },
        },
      },
    }),
  })

  const msgJson = await msgRes.json()
  if (!msgRes.ok) {
    return NextResponse.json({ error: msgJson.error?.message ?? 'Failed to send flow message' }, { status: 500 })
  }

  return NextResponse.json({ message_id: msgJson.messages?.[0]?.id })
}
