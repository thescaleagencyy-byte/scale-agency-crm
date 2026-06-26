import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id } = await request.json()
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  // Fetch conversation + contact phone separately (avoid join array/object ambiguity)
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id, account_id')
    .eq('id', conversation_id)
    .single()
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const { data: contact } = await supabase
    .from('contacts')
    .select('phone')
    .eq('id', conv.contact_id)
    .single()
  if (!contact?.phone) return NextResponse.json({ error: 'Contact has no phone' }, { status: 400 })

  // Skip only if customer already RESPONDED (rating not null) — not just "sent"
  const { data: existing } = await supabase
    .from('csat_responses')
    .select('id, rating')
    .eq('conversation_id', conversation_id)
    .not('rating', 'is', null)
    .maybeSingle()
  if (existing) return NextResponse.json({ skipped: true, reason: 'already_responded' })

  // Delete any un-responded stale record so we can resend
  await supabase
    .from('csat_responses')
    .delete()
    .eq('conversation_id', conversation_id)
    .is('rating', null)

  // Get WA config
  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', conv.account_id)
    .single()
  if (!config) return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 })

  const token = decrypt(config.access_token)
  const to = contact.phone.replace(/\D/g, '')
  if (!to) return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })

  // Try interactive buttons first
  let res = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'How would you rate your experience with us today?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `csat_${conversation_id}_5`, title: '⭐ Excellent' } },
            { type: 'reply', reply: { id: `csat_${conversation_id}_3`, title: '👍 OK' } },
            { type: 'reply', reply: { id: `csat_${conversation_id}_1`, title: '👎 Poor' } },
          ],
        },
      },
    }),
  })

  if (!res.ok) {
    // Fallback: plain text
    res = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: 'How would you rate your experience? Reply 5 (Excellent), 4 (Good), 3 (OK), 2 (Poor), or 1 (Very poor).' },
      }),
    })
  }

  const json = await res.json()
  if (!res.ok) {
    console.error('[csat] Meta send failed:', json)
    return NextResponse.json({ error: json.error?.message ?? 'Send failed', detail: json }, { status: 500 })
  }

  // Insert fresh pending record
  await supabase.from('csat_responses').insert({
    account_id: conv.account_id,
    conversation_id,
    contact_id: conv.contact_id,
  })

  return NextResponse.json({ sent: true, message_id: json.messages?.[0]?.id })
}
