import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { decryptMessages } from '@/lib/crypto';

function supabaseAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
  if (!profile?.account_id) return NextResponse.json({ error: 'No account' }, { status: 400 });

  const accountId = profile.account_id;
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = new Date().toISOString();

  // Fetch last 30 days closed conversations with messages
  const { data: convs } = await supabaseAdmin()
    .from('conversations')
    .select('id, status, created_at, resolved_at, last_message_text')
    .eq('account_id', accountId)
    .eq('status', 'closed')
    .gte('created_at', periodStart)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!convs || convs.length === 0) {
    return NextResponse.json({ error: 'Not enough closed conversations in the last 30 days to analyze.' }, { status: 422 });
  }

  // Fetch sample messages for context
  const convIds = convs.slice(0, 30).map((c: { id: string }) => c.id);
  const { data: messages } = await supabaseAdmin()
    .from('messages')
    .select('conversation_id, content_text, sender_type')
    .in('conversation_id', convIds)
    .eq('sender_type', 'contact')
    .not('content_text', 'is', null)
    .order('created_at')
    .limit(200);

  // Build conversation summaries
  const decryptedMessages = decryptMessages(messages ?? []);
  const convSummaries = convIds.map(id => {
    const msgs = decryptedMessages.filter((m: { conversation_id: string }) => m.conversation_id === id).map((m: { content_text?: string | null }) => m.content_text).filter(Boolean);
    return msgs.slice(0, 5).join(' | ');
  }).filter(Boolean);

  const analysisText = convSummaries.slice(0, 25).join('\n---\n');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You analyze WhatsApp customer conversations for a business. Extract actionable business intelligence. Return ONLY valid JSON with this exact structure:
{
  "top_objections": ["string", ...],
  "common_requests": ["string", ...],
  "sentiment_breakdown": { "positive": number, "neutral": number, "negative": number },
  "key_insights": ["string", ...],
  "summary": "2-3 sentence executive summary"
}
top_objections: 3-5 most common customer objections or hesitations.
common_requests: 3-5 most frequent customer requests or questions.
sentiment_breakdown: percentages (0-100, must sum to 100).
key_insights: 3-5 specific, actionable recommendations for the business.`,
      },
      {
        role: 'user',
        content: `Analyze these ${convSummaries.length} customer conversations from the last 30 days:\n\n${analysisText}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
  } catch {
    return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 });
  }

  const closeDays = convs
    .filter((c: { resolved_at: string | null; created_at: string }) => c.resolved_at)
    .map((c: { resolved_at: string; created_at: string }) => (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 86400000);
  const avgCloseDays = closeDays.length > 0 ? closeDays.reduce((a: number, b: number) => a + b, 0) / closeDays.length : null;

  const { data: report, error: insertErr } = await supabaseAdmin()
    .from('conversation_intelligence')
    .insert({
      account_id: accountId,
      period_start: periodStart,
      period_end: periodEnd,
      conversations_analyzed: convs.length,
      top_objections: parsed.top_objections ?? [],
      common_requests: parsed.common_requests ?? [],
      sentiment_breakdown: parsed.sentiment_breakdown ?? {},
      key_insights: parsed.key_insights ?? [],
      raw_summary: parsed.summary ?? '',
      avg_close_days: avgCloseDays,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ report });
}
