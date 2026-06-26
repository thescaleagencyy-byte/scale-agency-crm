'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Clock, MessageSquare, CheckCircle2, TrendingUp, Users } from 'lucide-react';

interface AgentStat {
  agent_id: string | null;
  full_name: string | null;
  total: number;
  resolved: number;
  avg_first_reply_mins: number | null;
  avg_resolution_mins: number | null;
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

  useEffect(() => {
    const db = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">SLA performance and agent workload across your team.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
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
