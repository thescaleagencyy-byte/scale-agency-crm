import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient } from '@/lib/openai/client'
import { triageLead } from '@/lib/leads/triage'

const BATCH_LIMIT = 25

// POST /api/leads/triage
//
// Replaces "reading every conversation by hand" (done manually during
// the 2026-08-16 CRM audit — it's what found the lawyer who asked for
// a callback and the customer complaining about duplicate messages,
// both of which the dumb has_name/has_company point score rated the
// same as spam). One user-triggered pass, not a background cron —
// mirrors the existing "Calculate insights" / "Scan for cold leads"
// button pattern rather than running unattended.
//
// Body: { lead_id?: string } — one lead, or omit to triage every
// untriaged lead for the caller's account (capped at BATCH_LIMIT per
// call so a large backlog doesn't blow past a request timeout or run
// up an unbounded OpenAI bill in one click).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const openai = getOpenAIClient()
  if (!openai) return NextResponse.json({ error: 'AI not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  const leadId: string | undefined = body?.lead_id

  let query = supabase
    .from('leads')
    .select('id, customer_name, company, service_type, raw_handoff, conversation_id')
    .is('ai_triaged_at', null)

  query = leadId ? query.eq('id', leadId) : query.limit(BATCH_LIMIT)

  const { data: leads, error: fetchError } = await query
  if (fetchError) {
    console.error('[leads/triage] fetch failed:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch leads.' }, { status: 500 })
  }
  if (!leads?.length) return NextResponse.json({ triaged: 0, results: [] })

  const results: Array<{ lead_id: string; quality: string; summary: string }> = []

  for (const lead of leads) {
    try {
      const result = await triageLead(supabase, lead)
      if (result) results.push({ lead_id: lead.id, ...result })
    } catch (err) {
      console.error('[leads/triage] failed for', lead.id, err)
    }
  }

  return NextResponse.json({ triaged: results.length, results })
}
