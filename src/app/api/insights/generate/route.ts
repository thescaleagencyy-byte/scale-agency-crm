import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface LeadRow {
  source: string | null
  service_type: string | null
  status: string
}

function winRateInsight(rows: LeadRow[], key: 'source' | 'service_type', label: string): { title: string; content: string } | null {
  const groups = new Map<string, { won: number; lost: number }>()
  for (const r of rows) {
    const k = (r[key] ?? '').trim()
    if (!k || (r.status !== 'won' && r.status !== 'lost')) continue
    const g = groups.get(k) ?? { won: 0, lost: 0 }
    if (r.status === 'won') g.won++
    else g.lost++
    groups.set(k, g)
  }
  const ranked = [...groups.entries()]
    .map(([k, g]) => ({ k, total: g.won + g.lost, rate: g.won / (g.won + g.lost) }))
    .filter((g) => g.total >= 3) // ignore samples too small to mean anything
    .sort((a, b) => b.rate - a.rate)
  if (ranked.length === 0) return null

  const lines = ranked.map((g) => `${g.k}: ${(g.rate * 100).toFixed(0)}% win rate (${g.total} closed leads)`)
  return {
    title: `${label} win rate`,
    content: `Calculated from closed leads (won/lost), samples under 3 excluded:\n${lines.join('\n')}`,
  }
}

// POST /api/insights/generate — deterministic pattern-mining over
// real lead data (win rate by source, by service type). Not a model
// that trains itself; a calculation the owner triggers, whose output
// gets written into business_knowledge so the Copilot picks it up on
// the next chat automatically. Re-running replaces the prior
// auto-generated insights rather than accumulating duplicates.
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 })

    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('source, service_type, status')
      .eq('account_id', profile.account_id)
    if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 })
    if (!leads || leads.length === 0) return NextResponse.json({ created: 0, message: 'No lead data yet to learn from.' })

    const insights = [
      winRateInsight(leads as LeadRow[], 'source', 'Lead source'),
      winRateInsight(leads as LeadRow[], 'service_type', 'Service type'),
    ].filter((i): i is { title: string; content: string } => i !== null)

    if (insights.length === 0) {
      return NextResponse.json({ created: 0, message: 'Not enough closed leads yet (need 3+ per group) to calculate a reliable pattern.' })
    }

    await supabase.from('business_knowledge').delete().eq('account_id', profile.account_id).eq('category', 'insight')
    const { error: insertErr } = await supabase.from('business_knowledge').insert(
      insights.map((i) => ({
        account_id: profile.account_id,
        category: 'insight' as const,
        title: i.title,
        content: i.content,
      })),
    )
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({ created: insights.length })
  } catch (err) {
    console.error('[insights/generate POST]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
