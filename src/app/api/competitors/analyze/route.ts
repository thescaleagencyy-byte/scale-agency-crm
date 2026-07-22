import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { decryptText } from '@/lib/crypto'

// POST /api/competitors/analyze — scrape a tracked competitor's page
// via Firecrawl and summarize pricing/offers/changes with Claude.
// Honestly errors if FIRECRAWL_API_KEY isn't set for this deployment
// rather than faking a result — this is an account-level Firecrawl
// credential, separate from the Firecrawl MCP access used during
// development, and doesn't exist for this app yet.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as { competitorId?: unknown } | null
    const competitorId = typeof body?.competitorId === 'string' ? body.competitorId : ''
    if (!competitorId) return NextResponse.json({ error: 'competitorId required' }, { status: 400 })

    const { data: competitor, error: fetchErr } = await supabase
      .from('competitors')
      .select('id, name, url')
      .eq('id', competitorId)
      .single()
    if (fetchErr || !competitor) return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })

    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    if (!firecrawlKey) {
      return NextResponse.json(
        { error: 'Firecrawl is not configured for this deployment yet — add FIRECRAWL_API_KEY in Integration Hub / Vercel env vars to enable competitor scraping.' },
        { status: 400 },
      )
    }

    const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: competitor.url, formats: ['markdown'] }),
    })
    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text().catch(() => '')
      return NextResponse.json({ error: `Firecrawl scrape failed: ${scrapeRes.status} ${errText.slice(0, 200)}` }, { status: 500 })
    }
    const scrapeData = await scrapeRes.json()
    const markdown: string = scrapeData?.data?.markdown ?? scrapeData?.markdown ?? ''
    if (!markdown) return NextResponse.json({ error: 'Firecrawl returned no content for this URL.' }, { status: 500 })

    // Summarize with whichever key this account has configured (same
    // Claude key used by the Copilot, via Settings → AI Insights).
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    let claudeKey: string | null = null
    if (profile?.account_id) {
      const { data: aiConfig } = await supabase.from('ai_config').select('claude_api_key').eq('account_id', profile.account_id).maybeSingle()
      if (aiConfig?.claude_api_key) {
        try { claudeKey = decryptText(aiConfig.claude_api_key) } catch { claudeKey = null }
      }
    }
    if (!claudeKey) {
      return NextResponse.json({ error: 'No Claude API key configured — add one in Settings → AI Insights to enable summarization.' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: claudeKey })
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 500,
      system: 'Summarize this competitor\'s website content in 5-8 bullet points: pricing (if visible), current offers/promotions, positioning, anything that changed-worthy for a business tracking this competitor. Bullets only, no intro/outro.',
      messages: [{ role: 'user', content: markdown.slice(0, 15000) }],
    })
    const summary = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()

    const { error: updateErr } = await supabase
      .from('competitors')
      .update({ last_summary: summary, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', competitorId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[competitors/analyze POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
