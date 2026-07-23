import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { decryptText } from '@/lib/crypto'
import { CLIENT_NAME, CLIENT_INDUSTRY } from '@/lib/features'

// POST /api/marketing/generate — Marketing OS v2, "freemium" scope:
// Claude (the account's own key, already paid for) writes the
// caption/hook/hashtags; Pollinations.ai (pollinations.ai — free,
// no API key, no account needed) generates the accompanying image
// via a plain URL, so there's no new paid API to gate this behind.
// Firecrawl (already configured for Competitor Intel) is used
// best-effort for a trend angle — if it fails or isn't configured,
// generation still proceeds without it rather than blocking.
// Output lands as content_posts drafts — still no social platform
// API connected, still nothing auto-published.

interface ContentIdea {
  title: string
  platform: string
  caption: string
  hashtags: string
  image_prompt: string
}

function pollinationsUrl(prompt: string): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`
}

async function fetchTrendContext(topic: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) return ''
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${topic} trends 2026`, limit: 3 }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const results = data?.data ?? []
    return results.map((r: { title?: string; description?: string }) => `${r.title ?? ''}: ${r.description ?? ''}`).join('\n').slice(0, 1500)
  } catch {
    return ''
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })
    const accountId = profile.account_id

    const body = (await request.json().catch(() => null)) as { topic?: unknown; platform?: unknown; count?: unknown } | null
    const topic = typeof body?.topic === 'string' && body.topic.trim() ? body.topic.trim() : (CLIENT_INDUSTRY || CLIENT_NAME || 'this business')
    const platform = typeof body?.platform === 'string' && body.platform.trim() ? body.platform.trim() : 'instagram'
    const count = typeof body?.count === 'number' && body.count > 0 && body.count <= 5 ? Math.floor(body.count) : 3

    const { data: aiConfig } = await supabase.from('ai_config').select('claude_api_key').eq('account_id', accountId).maybeSingle()
    let claudeKey: string | null = null
    if (aiConfig?.claude_api_key) {
      try { claudeKey = decryptText(aiConfig.claude_api_key) } catch { claudeKey = null }
    }
    if (!claudeKey) return NextResponse.json({ error: 'No Claude API key configured — add one in Settings → AI Insights.' }, { status: 400 })

    const { data: knowledge } = await supabase.from('business_knowledge').select('category, title, content').eq('account_id', accountId).in('category', ['products', 'tone', 'pricing'])
    const knowledgeContext = (knowledge ?? []).map((k) => `[${k.category}] ${k.title}: ${k.content}`).join('\n')

    const trendContext = await fetchTrendContext(topic)

    const anthropic = new Anthropic({ apiKey: claudeKey })
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: `You write short-form social content for ${CLIENT_NAME || 'a small business'}${CLIENT_INDUSTRY ? ` (${CLIENT_INDUSTRY})` : ''}. Output ONLY a JSON array, no markdown fences, no commentary — exactly ${count} objects with keys: title (short internal label), platform ("${platform}"), caption (the actual post text, 2-4 sentences, no hashtags inline), hashtags (5-8 relevant hashtags as one space-separated string starting with #), image_prompt (a vivid, concrete visual description for an image generator — no text/words in the image, describe scene/subject/style only).`,
      messages: [{
        role: 'user',
        content: `Topic/angle: ${topic}${knowledgeContext ? `\n\nBusiness facts to stay accurate to:\n${knowledgeContext}` : ''}${trendContext ? `\n\nCurrent trend signals:\n${trendContext}` : ''}`,
      }],
    })
    const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()

    let ideas: ContentIdea[]
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      ideas = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    } catch {
      return NextResponse.json({ error: 'AI returned unparseable output — try again.' }, { status: 500 })
    }
    if (!Array.isArray(ideas) || ideas.length === 0) {
      return NextResponse.json({ error: 'No content ideas generated.' }, { status: 500 })
    }

    const rows = ideas.map((idea) => ({
      account_id: accountId,
      title: idea.title || topic,
      platform: ['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook'].includes(idea.platform) ? idea.platform : platform,
      caption: idea.caption ?? '',
      hashtags: idea.hashtags ?? '',
      image_url: idea.image_prompt ? pollinationsUrl(idea.image_prompt) : null,
      status: 'draft' as const,
    }))

    const { error: insertErr } = await supabase.from('content_posts').insert(rows)
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({ created: rows.length, usedTrendData: !!trendContext })
  } catch (err) {
    console.error('[marketing/generate POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
