import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/whatsapp/csat — send CSAT survey when conversation is closed
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id } = await request.json()
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id, account_id, contacts(phone)')
    .eq('id', conversation_id)
    .single()

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Check no pending CSAT for this conversation already
  const { data: existing } = await supabase
    .from('csat_responses')
    .select('id')
    .eq('conversation_id', conversation_id)
    .maybeSingle()

  if (existing) return NextResponse.json({ skipped: true, reason: 'already_sent' })

  // Send via internal send route
  const sendRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      conversationId: conversation_id,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: 'How would you rate your experience with us today? Your feedback helps us improve.',
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `csat_${conversation_id}_5`, title: '⭐⭐⭐⭐⭐ Great' } },
            { type: 'reply', reply: { id: `csat_${conversation_id}_3`, title: '⭐⭐⭐ OK' } },
            { type: 'reply', reply: { id: `csat_${conversation_id}_1`, title: '⭐ Poor' } },
          ],
        },
      },
    }),
  })

  if (!sendRes.ok) {
    // Fall back to plain text if interactive not supported
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        conversationId: conversation_id,
        text: 'How would you rate your experience? Reply with a number:\n5 - Excellent\n4 - Good\n3 - OK\n2 - Poor\n1 - Very poor',
      }),
    })
  }

  // Create pending CSAT record
  await supabase.from('csat_responses').insert({
    account_id: conv.account_id,
    conversation_id,
    contact_id: conv.contact_id,
  })

  return NextResponse.json({ sent: true })
}
