import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/openai/client';

// ============================================================
// /api/ai/assistant — ad-hoc business Q&A chat ("AshWheelz AI").
//
// The floating header widget POSTs { question, history } and gets
// back a terse bullet answer grounded in live account data. All
// queries run through the caller's RLS-scoped client, so tenancy
// is enforced by the same policies the dashboard pages rely on.
// Message bodies are intentionally NOT included — they're
// encrypted at rest and the widget only needs aggregates.
// ============================================================

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

function count<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[key] ?? 'unknown');
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

function since(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function buildDataContext(db: SupabaseClient, currency: string): Promise<string> {
  const d7 = since(7);
  const d30 = since(30);

  const [leadsRes, dealsRes, stagesRes, convsRes, contactsRes, apptsRes, broadcastsRes] =
    await Promise.all([
      db
        .from('leads')
        .select('customer_name, company, service_type, source, status, score, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      db
        .from('deals')
        .select('title, value, status, stage_id, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500),
      db.from('pipeline_stages').select('id, name, position').order('position'),
      db
        .from('conversations')
        .select('status, created_at, resolved_at')
        .order('created_at', { ascending: false })
        .limit(500),
      db.from('contacts').select('id', { count: 'exact', head: true }),
      db
        .from('appointments')
        .select('status, created_at, slot:booking_slots(start_at), service:booking_services(name)')
        .order('created_at', { ascending: false })
        .limit(200),
      db
        .from('broadcasts')
        .select('name, status, total_recipients, sent_count, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

  const leads = (leadsRes.data ?? []) as {
    customer_name: string | null;
    company: string | null;
    service_type: string | null;
    source: string | null;
    status: string;
    score: number;
    created_at: string;
  }[];
  const deals = (dealsRes.data ?? []) as {
    title: string;
    value: number | null;
    status: string;
    stage_id: string;
    created_at: string;
  }[];
  const stages = (stagesRes.data ?? []) as { id: string; name: string }[];
  const convs = (convsRes.data ?? []) as { status: string; created_at: string }[];
  const appts = (apptsRes.data ?? []) as unknown as {
    status: string;
    created_at: string;
    slot: { start_at: string }[] | { start_at: string } | null;
    service: { name: string }[] | { name: string } | null;
  }[];
  const broadcasts = (broadcastsRes.data ?? []) as {
    name: string;
    status: string;
    total_recipients: number;
    sent_count: number | null;
    created_at: string;
  }[];

  // --- Leads ---
  const leads7 = leads.filter((l) => l.created_at >= d7);
  const leads30 = leads.filter((l) => l.created_at >= d30);
  const hotLeads = leads
    .filter((l) => l.status === 'new' && l.score >= 60)
    .slice(0, 10)
    .map((l) => `${l.customer_name ?? 'Unknown'}${l.company ? ` (${l.company})` : ''} score ${l.score}${l.service_type ? ` — ${l.service_type}` : ''}`);
  const avgScore30 = leads30.length
    ? Math.round(leads30.reduce((s, l) => s + (l.score ?? 0), 0) / leads30.length)
    : 0;

  // --- Pipeline ---
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const openDeals = deals.filter((d) => d.status === 'open');
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of openDeals) {
    const name = stageName.get(d.stage_id) ?? 'Unknown';
    byStage[name] = byStage[name] ?? { count: 0, value: 0 };
    byStage[name].count += 1;
    byStage[name].value += d.value ?? 0;
  }
  const won30 = deals.filter((d) => d.status === 'won' && d.created_at >= d30);
  const lost30 = deals.filter((d) => d.status === 'lost' && d.created_at >= d30);

  // --- Appointments ---
  const apptRows = appts.map((a) => {
    const slot = Array.isArray(a.slot) ? a.slot[0] : a.slot;
    const service = Array.isArray(a.service) ? a.service[0] : a.service;
    return { status: a.status, start_at: slot?.start_at ?? null, service: service?.name ?? null };
  });
  const upcoming = apptRows.filter((a) => a.start_at && a.start_at >= new Date().toISOString());

  return `ASHWHEELZ — LIVE CRM DATA (currency: ${currency})
Now: ${new Date().toISOString()}

LEADS
• Total tracked: ${leads.length} | Last 7d: ${leads7.length} | Last 30d: ${leads30.length}
• By status: ${JSON.stringify(count(leads, 'status'))}
• 7d by source: ${JSON.stringify(count(leads7, 'source'))}
• 30d by service type: ${JSON.stringify(count(leads30, 'service_type'))}
• Avg score (30d): ${avgScore30}/100
• Hot new leads (score ≥60): ${hotLeads.length ? hotLeads.join('; ') : 'none'}

PIPELINE
• Open deals: ${openDeals.length} worth ${currency} ${openDeals.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString()}
• By stage: ${JSON.stringify(byStage)}
• Won 30d: ${won30.length} (${currency} ${won30.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString()}) | Lost 30d: ${lost30.length}

CONVERSATIONS (WhatsApp)
• Open: ${convs.filter((c) => c.status === 'open').length} | Closed: ${convs.filter((c) => c.status === 'closed').length} | New 7d: ${convs.filter((c) => c.created_at >= d7).length}

CONTACTS: ${contactsRes.count ?? 0} total

APPOINTMENTS
• By status: ${JSON.stringify(count(apptRows, 'status'))}
• Upcoming: ${upcoming.length}${upcoming.length ? ` — next: ${upcoming.slice(0, 5).map((a) => `${a.service ?? 'appointment'} ${a.start_at}`).join('; ')}` : ''}

RECENT BROADCASTS
${broadcasts.length ? broadcasts.slice(0, 5).map((b) => `• "${b.name}" ${b.status}, ${b.sent_count ?? 0}/${b.total_recipients} sent (${b.created_at.slice(0, 10)})`).join('\n') : '• none'}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json(
        { error: 'AI is not configured. Add OPENAI_API_KEY to the deployment.' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      question?: unknown;
      history?: HistoryMessage[];
    } | null;
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account:accounts(name, default_currency)')
      .eq('user_id', user.id)
      .maybeSingle();
    const account = Array.isArray(profile?.account) ? profile?.account[0] : profile?.account;
    const currency = (account as { default_currency?: string } | null)?.default_currency ?? 'PKR';

    const dataContext = await buildDataContext(supabase, currency);

    // Data context rides in the first user turn only; follow-ups lean
    // on chat history, mirroring how the widget resends the thread.
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      {
        role: 'system',
        content: `You are AshWheelz AI — business data terminal for AshWheelz, a car dealership using this WhatsApp CRM.

REPLY FORMAT — non-negotiable:
• Bullet points only. NO paragraphs. Max 8 bullet lines.
• Lead each bullet with the number/fact in **bold**.
• No intro, no outro, no "based on the data".
• Money in ${currency}.
• If data can't answer the question, say so in one bullet and suggest the closest answerable metric.`,
      },
      ...(history.length > 0
        ? [
            {
              role: 'user' as const,
              content: `[BUSINESS DATA]\n${dataContext}\n[END DATA]\n\n${history[0].content}`,
            },
            ...history.slice(1).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: question },
          ]
        : [
            {
              role: 'user' as const,
              content: `[BUSINESS DATA]\n${dataContext}\n[END DATA]\n\n${question}`,
            },
          ]),
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 600,
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) return NextResponse.json({ error: 'AI returned an empty answer' }, { status: 500 });

    return NextResponse.json({ answer, tokensUsed: completion.usage?.total_tokens ?? null });
  } catch (err) {
    console.error('[ai/assistant POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
