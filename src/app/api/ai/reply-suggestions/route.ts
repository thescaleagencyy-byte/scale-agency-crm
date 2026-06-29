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
  if (!openai) return NextResponse.json({ suggestions: [] })

  // Fetch last 20 messages for context
  const { data: messages } = await supabase
    .from('messages')
    .select('sender_type, content_text, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!messages?.length) return NextResponse.json({ suggestions: [] })

  const transcript = decryptMessages(messages)
    .reverse()
    .filter(m => m.content_text)
    .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text}`)
    .join('\n')

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful WhatsApp CRM assistant. Generate 3 short, professional reply suggestions for the agent based on the conversation context. Each suggestion should be concise (1-2 sentences), actionable, and appropriate for a business WhatsApp conversation. Return ONLY a JSON array of 3 strings.`,
        },
        {
          role: 'user',
          content: `Conversation:\n${transcript}\n\nGenerate 3 reply suggestions for the agent:`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(content)
    const suggestions: string[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : Object.values(parsed).flat().filter(Boolean).slice(0, 3) as string[]
    return NextResponse.json({ suggestions: suggestions.slice(0, 3) })
  } catch (err) {
    console.error('[ai/reply-suggestions]', err)
    return NextResponse.json({ suggestions: [] })
  }
}
