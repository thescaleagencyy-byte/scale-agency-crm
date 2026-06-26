'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Clock, MessageSquare, CheckCircle2, TrendingUp, Users, Brain, Lightbulb, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface AgentStat {
  agent_id: string | null;
  full_name: string | null;
  total: number;
  resolved: number;
  avg_first_reply_mins: number | null;
  avg_resolution_mins: number | null;
}

interface IntelligenceReport {
  id: string;
  generated_at: string;
  conversations_analyzed: number;
  top_objections: string[];
  common_requests: string[];
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  key_insights: string[];
  raw_summary: string;
  avg_close_days: number | null;
}

interface RoiData {
  totalRevenue: number;
  wonDeals: number;
  avgCsat: number | null;
  csatCount: number;
}

interface SLASummary {
  total_conversations: number;
  resolved_today: number;
  avg_first_reply_mins: number | null;
  avg_resolution_mins: number | null;
  within_1h: number;
  within_24h: number;
}

function fmt(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<SLASummary | null>(null);
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [intelligence, setIntelligence] = useState<IntelligenceReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [roi, setRoi] = useState<RoiData | null>(null);

  useEffect(() => {
    const db = createClient();
    // Fetch latest intelligence report
    db.from('conversation_intelligence').select('*').order('generated_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setIntelligence(data as IntelligenceReport); });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch ROI data: won deals + CSAT avg
    Promise.all([
      db.from('deals').select('value, currency').eq('stage', 'won'),
      db.from('csat_responses').select('rating').not('rating', 'is', null),
    ]).then(([dealsRes, csatRes]) => {
      const deals = dealsRes.data ?? [];
      const csatRatings = (csatRes.data ?? []).map((r: { rating: number }) => r.rating).filter(Boolean);
      const totalRevenue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
      const avgCsat = csatRatings.length > 0
        ? csatRatings.reduce((a: number, b: number) => a + b, 0) / csatRatings.length
        : null;
      setRoi({ totalRevenue, wonDeals: deals.length, avgCsat, csatCount: csatRatings.length });
    });

    Promise.all([
      db.from('conversations').select('id, status, first_replied_at, resolved_at, assigned_agent_id, created_at'),
      db.from('profiles').select('user_id, full_name'),
    ]).then(([convRes, profilesRes]) => {
      const convs = convRes.data ?? [];
      const profiles: Record<string, string> = {};
      (profilesRes.data ?? []).forEach(p => { profiles[p.user_id] = p.full_name; });

      const todayMs = today.getTime();
      const resolved = convs.filter(c => c.resolved_at);
      const resolvedToday = resolved.filter(c => new Date(c.resolved_at!).getTime() >= todayMs);

      const firstReplyMins = convs
        .filter(c => c.first_replied_at && c.created_at)
        .map(c => (new Date(c.first_replied_at!).getTime() - new Date(c.created_at).getTime()) / 60000);

      const resolutionMins = resolved
        .filter(c => c.created_at)
        .map(c => (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime()) / 60000);

      const avgFirst = firstReplyMins.length > 0 ? firstReplyMins.reduce((a, b) => a + b, 0) / firstReplyMins.length : null;
      const avgRes = resolutionMins.length > 0 ? resolutionMins.reduce((a, b) => a + b, 0) / resolutionMins.length : null;

      const within1h = firstReplyMins.filter(m => m <= 60).length;
      const within24h = firstReplyMins.filter(m => m <= 1440).length;

      setSummary({
        total_conversations: convs.length,
        resolved_today: resolvedToday.length,
        avg_first_reply_mins: avgFirst,
        avg_resolution_mins: avgRes,
        within_1h: firstReplyMins.length > 0 ? Math.round((within1h / firstReplyMins.length) * 100) : 0,
        within_24h: firstReplyMins.length > 0 ? Math.round((within24h / firstReplyMins.length) * 100) : 0,
      });

      // Per-agent stats
      const agentMap: Record<string, AgentStat> = {};
      for (const c of convs) {
        const key = c.assigned_agent_id ?? '__unassigned__';
        if (!agentMap[key]) {
          agentMap[key] = {
            agent_id: c.assigned_agent_id,
            full_name: c.assigned_agent_id ? (profiles[c.assigned_agent_id] ?? 'Unknown agent') : 'Unassigned',
            total: 0,
            resolved: 0,
            avg_first_reply_mins: null,
            avg_resolution_mins: null,
          };
        }
        agentMap[key].total++;
        if (c.resolved_at) agentMap[key].resolved++;
      }
      setAgents(Object.values(agentMap).sort((a, b) => b.total - a.total));
      setLoading(false);
    });
  }, []);

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/intelligence/analyze', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? 'Analysis failed'); setAnalyzing(false); return; }
      setIntelligence(json.report as IntelligenceReport);
      toast.success('Intelligence report generated');
    } catch {
      toast.error('Failed to run analysis');
    }
    setAnalyzing(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">SLA performance, agent workload, and AI conversation intelligence.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* ROI banner */}
          {roi && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">Revenue from CRM</p>
                <p className="text-2xl font-bold text-primary">${roi.totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{roi.wonDeals} deals won</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CSAT Score</p>
                <p className="text-2xl font-bold text-foreground">
                  {roi.avgCsat != null ? `${roi.avgCsat.toFixed(1)}/5` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{roi.csatCount} responses</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CSAT Satisfaction</p>
                <p className="text-2xl font-bold text-foreground">
                  {roi.avgCsat != null ? `${Math.round((roi.avgCsat / 5) * 100)}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">avg rating</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deal Win Rate</p>
                <p className="text-2xl font-bold text-foreground">
                  {summary ? `${Math.round((roi.wonDeals / Math.max(summary.total_conversations, 1)) * 100)}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">conversations → won</p>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={MessageSquare} label="Total Conversations" value={(summary?.total_conversations ?? 0).toLocaleString()} />
            <StatCard icon={CheckCircle2} label="Resolved Today" value={(summary?.resolved_today ?? 0).toLocaleString()} />
            <StatCard icon={Clock} label="Avg First Reply" value={fmt(summary?.avg_first_reply_mins ?? null)} sub="time to first agent message" />
            <StatCard icon={TrendingUp} label="Avg Resolution" value={fmt(summary?.avg_resolution_mins ?? null)} sub="open → resolved" />
          </div>

          {/* SLA targets */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <p className="text-sm font-semibold text-foreground">SLA Targets</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">First reply within 1 hour</span>
                  <span className="text-sm font-bold text-foreground">{summary?.within_1h ?? 0}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${summary?.within_1h ?? 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">First reply within 24 hours</span>
                  <span className="text-sm font-bold text-foreground">{summary?.within_24h ?? 0}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${summary?.within_24h ?? 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Conversation Intelligence */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Conversation Intelligence</p>
                {intelligence && (
                  <span className="text-xs text-muted-foreground">
                    · last analyzed {new Date(intelligence.generated_at).toLocaleDateString()} · {intelligence.conversations_analyzed} conversations
                  </span>
                )}
              </div>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {analyzing ? 'Analyzing…' : 'Analyze Now'}
              </button>
            </div>

            {intelligence ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Summary */}
                {intelligence.raw_summary && (
                  <div className="lg:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold text-primary">AI Summary</p>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{intelligence.raw_summary}</p>
                  </div>
                )}

                {/* Top objections */}
                {intelligence.top_objections.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                      <p className="text-xs font-semibold text-foreground">Top Customer Objections</p>
                    </div>
                    <ul className="space-y-1.5">
                      {intelligence.top_objections.map((o, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[9px] font-bold text-amber-400">{i + 1}</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Common requests */}
                {intelligence.common_requests.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold text-foreground">Most Common Requests</p>
                    </div>
                    <ul className="space-y-1.5">
                      {intelligence.common_requests.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">{i + 1}</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key insights */}
                {intelligence.key_insights.length > 0 && (
                  <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold text-foreground">Actionable Insights</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {intelligence.key_insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                          <p className="text-xs text-foreground leading-relaxed">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sentiment + close time */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold text-foreground mb-3">Sentiment Breakdown</p>
                  <div className="space-y-2">
                    {(['positive', 'neutral', 'negative'] as const).map(k => {
                      const pct = intelligence.sentiment_breakdown?.[k] ?? 0;
                      const colors: Record<string, string> = { positive: 'bg-primary', neutral: 'bg-muted-foreground', negative: 'bg-red-500' };
                      return (
                        <div key={k}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground capitalize">{k}</span>
                            <span className="text-xs font-bold text-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${colors[k]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {intelligence.avg_close_days !== null && (
                  <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground mb-1">Avg days to close conversation</p>
                    <p className="text-3xl font-bold text-foreground">{intelligence.avg_close_days.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">days</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <Brain className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">No intelligence report yet</p>
                <p className="mt-1 text-xs text-muted-foreground mb-4">Click &ldquo;Analyze Now&rdquo; to run AI analysis on last 30 days of conversations. Requires 10+ closed conversations.</p>
                <button
                  onClick={runAnalysis}
                  disabled={analyzing}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {analyzing ? 'Analyzing…' : 'Run Analysis'}
                </button>
              </div>
            )}
          </div>

          {/* Agent breakdown */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Agent Performance</p>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left text-xs text-muted-foreground px-4 py-2.5 font-medium">Agent</th>
                    <th className="text-right text-xs text-muted-foreground px-4 py-2.5 font-medium">Assigned</th>
                    <th className="text-right text-xs text-muted-foreground px-4 py-2.5 font-medium">Resolved</th>
                    <th className="text-right text-xs text-muted-foreground px-4 py-2.5 font-medium">Resolution %</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => (
                    <tr key={a.agent_id ?? 'unassigned'} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
                            {(a.full_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-foreground">{a.full_name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">{a.total}</td>
                      <td className="px-4 py-3 text-right text-foreground">{a.resolved}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold ${a.total > 0 && (a.resolved / a.total) >= 0.8 ? 'text-primary' : 'text-muted-foreground'}`}>
                          {a.total > 0 ? Math.round((a.resolved / a.total) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {agents.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No conversation data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
