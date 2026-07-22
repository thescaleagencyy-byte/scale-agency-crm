import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/openai/client';
import { decryptText } from '@/lib/crypto';
import { CLIENT_INDUSTRY, CLIENT_NAME } from '@/lib/features';

// ============================================================
// /api/ai/assistant — ad-hoc business Q&A chat.
//
// The floating header widget POSTs { question, history } and gets
// back a terse bullet answer grounded in live account data. All
// queries run through the caller's RLS-scoped client, so tenancy
// is enforced by the same policies the dashboard pages rely on.
// Message bodies are intentionally NOT included — they're
// encrypted at rest and the widget only needs aggregates.
// ============================================================

const IS_RENTAL_INDUSTRY = (() => {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase();
  return ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel');
})();
const BUSINESS_LABEL = IS_RENTAL_INDUSTRY
  ? `${CLIENT_NAME || 'this business'}, a heavy equipment/vehicle rental business serving project sites`
  : CLIENT_INDUSTRY
    ? `${CLIENT_NAME || 'this business'}, a ${CLIENT_INDUSTRY.toLowerCase()} business`
    : CLIENT_NAME || 'this business';
const AI_LABEL = CLIENT_NAME ? `${CLIENT_NAME} AI` : 'Scale Agency AI';

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================
// Tools — the "AI does the work" layer, not just Q&A.
//
// Every tool executes through the caller's own RLS-scoped Supabase
// client (the same `supabase` used for buildDataContext below), so
// a tool call can never touch another account's rows — RLS is the
// safety boundary, not prompt instructions. Scoped deliberately
// narrow for v1: one safe, reversible action (lead status), not a
// generic "run any SQL" tool. Ambiguous matches are refused rather
// than guessed — better to ask the user than update the wrong lead.
// ============================================================

const LEAD_STATUS_VALUES = ['new', 'called', 'won', 'lost'] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_lead_status',
    description:
      "Update a lead's status (new/called/won/lost). Use when the user asks to mark, close, or update a specific lead by name or phone. Do not guess which lead if the search matches more than one — the tool will tell you and you should ask the user to be more specific.",
    input_schema: {
      type: 'object',
      properties: {
        customer_search: {
          type: 'string',
          description: "The lead's customer name or phone number (or a fragment of either) to find the right row.",
        },
        status: { type: 'string', enum: [...LEAD_STATUS_VALUES] },
      },
      required: ['customer_search', 'status'],
    },
  },
];

// Same tool, OpenAI's function-calling shape — kept as a separate literal
// (rather than transformed from TOOLS) since the two SDKs' schemas diverge
// enough that a generic converter would be harder to read than this.
const OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'update_lead_status',
      description:
        "Update a lead's status (new/called/won/lost). Use when the user asks to mark, close, or update a specific lead by name or phone. Do not guess which lead if the search matches more than one — the tool will tell you and you should ask the user to be more specific.",
      parameters: {
        type: 'object',
        properties: {
          customer_search: {
            type: 'string',
            description: "The lead's customer name or phone number (or a fragment of either) to find the right row.",
          },
          status: { type: 'string', enum: [...LEAD_STATUS_VALUES] },
        },
        required: ['customer_search', 'status'],
      },
    },
  },
];

async function runTool(
  db: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === 'update_lead_status') {
    const search = String(input.customer_search ?? '').trim();
    const status = String(input.status ?? '');
    if (!search) return 'Error: no customer_search provided.';
    if (!(LEAD_STATUS_VALUES as readonly string[]).includes(status)) {
      return `Error: "${status}" is not a valid status. Valid: ${LEAD_STATUS_VALUES.join(', ')}.`;
    }

    const { data: matches, error } = await db
      .from('leads')
      .select('id, customer_name, customer_phone, status')
      .or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`)
      .limit(5);
    if (error) return `Error looking up lead: ${error.message}`;
    if (!matches || matches.length === 0) return `No lead found matching "${search}".`;
    if (matches.length > 1) {
      const list = matches.map((m) => `${m.customer_name ?? 'Unknown'} (${m.customer_phone})`).join(', ');
      return `Found ${matches.length} leads matching "${search}": ${list}. Ask the user which one they mean before updating.`;
    }

    const lead = matches[0];
    const { error: updateErr } = await db
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (updateErr) return `Error updating lead: ${updateErr.message}`;
    return `Updated ${lead.customer_name ?? lead.customer_phone}'s lead status from "${lead.status}" to "${status}".`;
  }
  return `Error: unknown tool "${name}".`;
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
        .select('customer_name, company, service_type, project_site, duration, source, status, score, created_at')
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
    project_site: string | null;
    duration: string | null;
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

  return `${(CLIENT_NAME || 'BUSINESS').toUpperCase()} — LIVE CRM DATA (currency: ${currency})
Now: ${new Date().toISOString()}

LEADS
• Total tracked: ${leads.length} | Last 7d: ${leads7.length} | Last 30d: ${leads30.length}
• By status: ${JSON.stringify(count(leads, 'status'))}
• 7d by source: ${JSON.stringify(count(leads7, 'source'))}
• 30d by service type: ${JSON.stringify(count(leads30, 'service_type'))}
• 30d by project site: ${JSON.stringify(count(leads30, 'project_site'))}
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

    // Engine selection: the workspace Claude key (Settings → AI
    // Insights) wins; the deployment-wide OpenAI env key is the
    // fallback so the widget keeps working before a key is saved.
    let claudeKey: string | null = null;
    if (profile?.account_id) {
      const { data: aiConfig } = await supabase
        .from('ai_config')
        .select('claude_api_key')
        .eq('account_id', profile.account_id)
        .maybeSingle();
      if (aiConfig?.claude_api_key) {
        try {
          claudeKey = decryptText(aiConfig.claude_api_key);
        } catch {
          claudeKey = null; // rotated encryption key — fall back
        }
      }
    }
    const openai = claudeKey ? null : getOpenAIClient();
    if (!claudeKey && !openai) {
      return NextResponse.json(
        { error: 'AI is not configured. Add your Claude API key in Settings → AI Insights.' },
        { status: 400 },
      );
    }

    const dataContext = await buildDataContext(supabase, currency);

    const systemPrompt = `You are ${AI_LABEL} — business data terminal for ${BUSINESS_LABEL}, using this WhatsApp CRM.

REPLY FORMAT — non-negotiable:
• Bullet points only. NO paragraphs. Max 8 bullet lines.
• Lead each bullet with the number/fact in **bold**.
• No intro, no outro, no "based on the data".
• Money in ${currency}.
• If data can't answer the question, say so in one bullet and suggest the closest answerable metric.

You can also take action, not just report — use the update_lead_status tool when the user asks to mark/close/update a specific lead. If the tool says multiple leads matched, ask the user to be more specific instead of picking one yourself.`;

    // Data context rides in the first user turn only; follow-ups lean
    // on chat history, mirroring how the widget resends the thread.
    const turns: { role: 'user' | 'assistant'; content: string }[] =
      history.length > 0
        ? [
            {
              role: 'user',
              content: `[BUSINESS DATA]\n${dataContext}\n[END DATA]\n\n${history[0].content}`,
            },
            ...history.slice(1).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: question },
          ]
        : [
            {
              role: 'user',
              content: `[BUSINESS DATA]\n${dataContext}\n[END DATA]\n\n${question}`,
            },
          ];

    let answer: string | undefined;
    let tokensUsed: number | null = null;

    if (claudeKey) {
      const anthropic = new Anthropic({ apiKey: claudeKey });
      let conversation: Anthropic.MessageParam[] = turns;
      let response = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: conversation,
        tools: TOOLS,
      });
      tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      // Tool-use loop: execute any tool calls, feed results back, repeat
      // until Claude replies with plain text. Capped at 3 rounds so a
      // confused model can't loop forever burning tokens.
      let rounds = 0;
      while (response.stop_reason === 'tool_use' && rounds < 3) {
        rounds += 1;
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const toolResults = await Promise.all(
          toolUses.map(async (tu) => ({
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: await runTool(supabase, tu.name, tu.input as Record<string, unknown>),
          })),
        );
        conversation = [
          ...conversation,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
        response = await anthropic.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 600,
          thinking: { type: 'adaptive' },
          system: systemPrompt,
          messages: conversation,
          tools: TOOLS,
        });
        tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
      }

      answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } else if (openai) {
      type Msg = OpenAI.Chat.ChatCompletionMessageParam;
      let conversation: Msg[] = [{ role: 'system', content: systemPrompt }, ...turns];
      let completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: conversation,
        max_tokens: 600,
        tools: OPENAI_TOOLS,
      });
      tokensUsed = completion.usage?.total_tokens ?? 0;

      let rounds = 0;
      let message = completion.choices[0]?.message;
      while (message?.tool_calls && message.tool_calls.length > 0 && rounds < 3) {
        rounds += 1;
        const funcCalls = message.tool_calls.filter(
          (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === 'function',
        );
        const toolResults: Msg[] = await Promise.all(
          funcCalls.map(async (tc) => ({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: await runTool(supabase, tc.function.name, JSON.parse(tc.function.arguments || '{}')),
          })),
        );
        conversation = [...conversation, message, ...toolResults];
        completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: conversation,
          max_tokens: 600,
          tools: OPENAI_TOOLS,
        });
        tokensUsed += completion.usage?.total_tokens ?? 0;
        message = completion.choices[0]?.message;
      }

      answer = message?.content?.trim() ?? undefined;
    }

    if (!answer) return NextResponse.json({ error: 'AI returned an empty answer' }, { status: 500 });

    return NextResponse.json({ answer, tokensUsed });
  } catch (err) {
    console.error('[ai/assistant POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
