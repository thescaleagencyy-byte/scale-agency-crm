'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Search, ChevronLeft, ChevronRight, Phone, Loader2, PhoneOff,
  Clock, AlertTriangle, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { EmptyState } from '@/components/dashboard/empty-state';
import type { VoiceCall } from '@/types';

const PAGE_SIZE = 25;

const CALL_TYPE_LABEL: Record<string, string> = {
  booking_request: 'Booking',
  pricing_question: 'Pricing',
  availability_question: 'Availability',
  order_status: 'Order Status',
  complaint: 'Complaint',
  general_info: 'General Info',
  human_request: 'Human Request',
  other: 'Other',
};

function CallTypeBadge({ type }: { type: string | null }) {
  const isUrgent = type?.startsWith('URGENT');
  const isComplaint = type === 'complaint' || type?.startsWith('COMPLAINT');
  const label = type ? (CALL_TYPE_LABEL[type] ?? type.replace(/_/g, ' ')) : '—';
  const cls = isUrgent
    ? 'bg-red-500/15 text-red-600 border-red-500/30'
    : isComplaint
      ? 'bg-orange-500/15 text-orange-600 border-orange-500/30'
      : 'bg-muted text-muted-foreground border-border';
  return <Badge variant="outline" className={`text-xs capitalize ${cls}`}>{label}</Badge>;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceAgentPage() {
  const { profile } = useAuth();
  const accountId = profile?.account_id ?? null;

  const [agentEnabled, setAgentEnabled] = useState<boolean | null>(null);
  const [togglingAgent, setTogglingAgent] = useState(false);

  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<VoiceCall | null>(null);

  // Global stats — independent of current search/filter.
  const [stats, setStats] = useState<{
    total: number; escalated: number; today: number; avgDuration: number;
  } | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      let query = supabase
        .from('voice_calls')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterType !== 'all') query = query.eq('call_type', filterType);
      if (debouncedSearch.trim()) {
        const term = debouncedSearch
          .trim()
          .replace(/[,()]/g, ' ')
          .replace(/[%_]/g, '\\$&');
        query = query.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
      }

      const { data, count, error } = await query;
      if (error) toast.error(error.message);
      else { setCalls((data as VoiceCall[]) ?? []); setTotal(count ?? 0); }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterType]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      supabase.from('voice_calls').select('id', { count: 'exact', head: true }),
      supabase.from('voice_calls').select('id', { count: 'exact', head: true }).eq('escalated_to_ops', true),
      supabase.from('voice_calls').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
      supabase.from('voice_calls').select('duration_seconds').not('duration_seconds', 'is', null),
    ]).then(([totalRes, escalatedRes, todayRes, durationsRes]) => {
      const durations = (durationsRes.data ?? []).map((r) => r.duration_seconds as number);
      const avgDuration = durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
      setStats({
        total: totalRes.count ?? 0,
        escalated: escalatedRes.count ?? 0,
        today: todayRes.count ?? 0,
        avgDuration,
      });
    });
  }, [calls.length]);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('voice_agent_control')
      .select('enabled')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error(error); return; }
        setAgentEnabled(data?.enabled ?? true);
      });
  }, [accountId]);

  async function toggleAgent(next: boolean) {
    if (!accountId) return;
    setTogglingAgent(true);
    const prev = agentEnabled;
    setAgentEnabled(next);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('voice_agent_control')
        .upsert(
          {
            account_id: accountId,
            enabled: next,
            updated_by: profile?.email ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' },
        );
      if (error) throw error;
      toast.success(next ? 'Voice agent resumed' : 'Voice agent paused');
    } catch (e) {
      setAgentEnabled(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to update voice agent status');
    } finally {
      setTogglingAgent(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const callTypes = Array.from(new Set(calls.map((c) => c.call_type).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Voice Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reem — AshWheelz&apos;s inbound voice agent. Every call, recorded and logged.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
          <Switch
            checked={agentEnabled ?? true}
            onCheckedChange={toggleAgent}
            disabled={togglingAgent || agentEnabled === null}
            aria-label={agentEnabled ? 'Pause voice agent' : 'Resume voice agent'}
          />
          <span className="text-sm font-medium text-foreground">
            {agentEnabled === null ? '…' : agentEnabled ? 'Live' : 'Paused'}
          </span>
        </div>
      </div>

      {agentEnabled === false && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Voice agent is paused. Note: this switch isn&apos;t wired to call routing yet — no phone number
          is connected to the agent, so there&apos;s nothing live to pause. It will take effect once a
          number is attached.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total Calls" value={String(stats?.total ?? 0)} icon={Phone} variant="hero" />
        <MetricCard title="Escalated to Ops" value={String(stats?.escalated ?? 0)} icon={AlertTriangle} variant="tint3" />
        <MetricCard title="Today" value={String(stats?.today ?? 0)} icon={Clock} variant="tint2" />
        <MetricCard
          title="Avg Duration"
          value={stats ? formatDuration(stats.avgDuration) : '—'}
          icon={CheckCircle2}
          variant="tint1"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search calls..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground w-64"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['all', ...callTypes] as string[]).map((t) => (
            <button
              key={t}
              onClick={() => { setFilterType(t); setPage(0); }}
              className={[
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors capitalize',
                filterType === t
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {t === 'all' ? 'All' : (CALL_TYPE_LABEL[t] ?? t.replace(/_/g, ' '))}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading calls...</span>
          </div>
        ) : calls.length === 0 ? (
          <EmptyState
            icon={PhoneOff}
            title="No calls yet"
            hint="Calls to the voice agent will appear here once a phone number is connected and calls start coming in."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Caller</TableHead>
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Language</TableHead>
                <TableHead className="text-muted-foreground">Duration</TableHead>
                <TableHead className="text-muted-foreground">Resolved</TableHead>
                <TableHead className="text-muted-foreground">Escalated</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow
                  key={call.id}
                  className="border-border cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedCall(call)}
                >
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">{call.customer_name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{call.customer_phone ?? '—'}</div>
                  </TableCell>
                  <TableCell><CallTypeBadge type={call.call_type} /></TableCell>
                  <TableCell className="text-sm text-foreground capitalize">{call.language_used || '—'}</TableCell>
                  <TableCell className="text-sm text-foreground tabular-nums">{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell>
                    {call.resolved == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : call.resolved ? (
                      <Badge variant="outline" className="text-xs bg-green-500/15 text-green-600 border-green-500/30">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {call.escalated_to_ops ? (
                      <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 border-red-500/30">Escalated</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(call.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setSelectedCall(call); }}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!selectedCall} onOpenChange={(open) => !open && setSelectedCall(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedCall && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedCall.customer_name ?? selectedCall.customer_phone ?? 'Unknown caller'}</SheetTitle>
                <SheetDescription>
                  {new Date(selectedCall.created_at).toLocaleString('en-GB')} · {formatDuration(selectedCall.duration_seconds)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6 px-1">
                <div className="flex flex-wrap gap-2">
                  <CallTypeBadge type={selectedCall.call_type} />
                  {selectedCall.language_used && (
                    <Badge variant="outline" className="text-xs capitalize">{selectedCall.language_used}</Badge>
                  )}
                  {selectedCall.escalated_to_ops && (
                    <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 border-red-500/30">Escalated to ops</Badge>
                  )}
                  {selectedCall.resolved != null && (
                    <Badge variant="outline" className={`text-xs ${selectedCall.resolved ? 'bg-green-500/15 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                      {selectedCall.resolved ? 'Resolved' : 'Not resolved'}
                    </Badge>
                  )}
                </div>

                {selectedCall.recording_url && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recording</h3>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={selectedCall.recording_url} className="w-full" />
                  </div>
                )}

                {selectedCall.summary && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Summary</h3>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedCall.summary}</p>
                  </div>
                )}

                {selectedCall.transcript && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Transcript</h3>
                    <p className="text-sm text-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/50 rounded-lg p-3 max-h-96 overflow-y-auto">
                      {selectedCall.transcript}
                    </p>
                  </div>
                )}

                {!selectedCall.summary && !selectedCall.transcript && !selectedCall.recording_url && (
                  <p className="text-sm text-muted-foreground">No transcript, summary, or recording available for this call.</p>
                )}

                {selectedCall.ended_reason && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ended Reason</h3>
                    <p className="text-sm text-foreground">{selectedCall.ended_reason}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
