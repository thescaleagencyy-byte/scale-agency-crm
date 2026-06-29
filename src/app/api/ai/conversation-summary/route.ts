import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient } from '@/lib/openai/client'
import { decryptMessages } from '@/lib/crypto'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id } = await request.json()
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ summary: null })

  const { data: messages } = await supabase
    .from('messages')
    .select('sender_type, content_text, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!messages?.length) return NextResponse.json({ summary: null })

  const transcript = decryptMessages(messages)
    .filter(m => m.content_text)
    .map(m => `${m.sender_type === 'customer' ? 'Customer' : m.sender_type === 'bot' ? 'Bot' : 'Agent'}: ${m.content_text}`)
    .join('\n')

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a CRM assistant. Summarize this WhatsApp conversation for a human agent who is taking over. Be concise. Format as JSON with keys: "customer_intent" (what they want), "key_details" (array of important facts like budget, location, timeline), "sentiment" ("positive"|"neutral"|"negative"), "suggested_next_action" (one sentence).`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content ?? '{}'
    const summary = JSON.parse(content)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[ai/conversation-summary]', err)
    return NextResponse.json({ summary: null })
  }
}
