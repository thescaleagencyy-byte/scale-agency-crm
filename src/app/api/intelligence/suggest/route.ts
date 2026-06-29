import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { decryptMessages } from '@/lib/crypto'

export async function POST(request: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id } = await request.json()
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  // Fetch last 20 messages
  const { data: rawMessages } = await supabase
    .from('messages')
    .select('sender_type, content_text, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!rawMessages?.length) return NextResponse.json({ suggestions: [] })

  const messages = decryptMessages(rawMessages)

  const history = messages
    .reverse()
    .filter(m => m.content_text)
    .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text}`)
    .join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a helpful WhatsApp business agent assistant. Given a conversation history, suggest 3 short natural reply options the agent could send next. Detect the customer's language and reply in it. Each suggestion should be concise (1-2 sentences max), conversational, and move the conversation forward. Return ONLY a JSON array of 3 strings, no extra text.`,
      },
      {
        role: 'user',
        content: `Conversation:\n${history}\n\nSuggest 3 agent replies as a JSON array.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
    temperature: 0.7,
  })

  try {
    const raw = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(raw)
    // Handle both {"suggestions": [...]} and direct array format
    const suggestions: string[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : Object.values(parsed).find(v => Array.isArray(v)) as string[] ?? []
    return NextResponse.json({ suggestions: suggestions.slice(0, 3) })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
