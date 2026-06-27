'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, Clock,
  Activity, ExternalLink, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { N8nExecution } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(startedAt: string, stoppedAt?: string): string {
  const ms = (stoppedAt ? new Date(stoppedAt) : new Date()).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function durationMs(e: N8nExecution): number {
  if (!e.stoppedAt) return 0;
  return new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime();
}

// ─── action tag ─────────────────────────────────────────────────────────────

type TagVariant = 'muted' | 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'emerald' | 'orange';

interface ActionTag { label: string; variant: TagVariant }

const LAST_NODE_MAP: Record<string, ActionTag> = {
  'Send Plain Text':         { label: 'Message Replied',   variant: 'blue' },
  'Check Send Profile?':     { label: 'Message Replied',   variant: 'blue' },
  'Check Send Catalog?':     { label: 'Message Replied',   variant: 'blue' },
  'Log Profile to CRM':      { label: 'Profile PDF Sent',  variant: 'purple' },
  'Log Catalog to CRM':      { label: 'Catalog PDF Sent',  variant: 'purple' },
  'Send Profile':            { label: 'Profile PDF Sent',  variant: 'purple' },
  'Send Catalog':            { label: 'Catalog PDF Sent',  variant: 'purple' },
  'Log Button Reply to CRM': { label: 'Buttons Sent',      variant: 'blue' },
  'Send Welcome Buttons':    { label: 'Welcome Sent',      variant: 'blue' },
  'Send Confirm Buttons':    { label: 'Confirm Sent',      variant: 'blue' },
  'Send Services Buttons':   { label: 'Services Sent',     variant: 'blue' },
  'Log Lead to CRM':         { label: 'Lead Captured',     variant: 'emerald' },
  'Set Handoff Flag':        { label: 'Lead Captured',     variant: 'emerald' },
  'Alert Admin New Lead':    { label: 'Lead Captured',     variant: 'emerald' },
  'Alert Admin Escalation':  { label: 'Escalated',         variant: 'orange' },
  'Non-Text Reply':          { label: 'Unsupported Media', variant: 'amber' },
  'Handoff Waiting Reply':   { label: 'Handoff Active',    variant: 'amber' },
  'Guard & Session':         { label: 'Filtered',          variant: 'muted' },
  'Unwrap Meta Payload':     { label: 'Filtered',          variant: 'muted' },
};

function getActionTag(e: N8nExecution): ActionTag {
  if (e.status === 'error' || e.status === 'crashed') return { label: 'Failed', variant: 'red' };
  if (e.status === 'running') return { label: 'Running', variant: 'blue' };
  if (e.status === 'waiting') return { label: 'Waiting', variant: 'amber' };

  const lastNode = e.data?.resultData?.lastNodeExecuted;
  if (lastNode && LAST_NODE_MAP[lastNode]) return LAST_NODE_MAP[lastNode];

  // Duration heuristic when lastNodeExecuted not available
  const ms = durationMs(e);
  if (ms < 80)   return { label: 'Filtered',      variant: 'muted' };
  if (ms < 2500) return { label: 'Replied',        variant: 'blue' };
  return              { label: 'AI Replied',       variant: 'green' };
}

const TAG_CLASSES: Record<TagVariant, string> = {
  muted:   'bg-muted/60 text-muted-foreground border-border',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  green:   'bg-green-500/10 text-green-400 border-green-500/30',
  purple:  'bg-purple-500/10 text-purple-400 border-purple-500/30',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/30',
  red:     'bg-red-500/10 text-red-400 border-red-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  orange:  'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

// ─── date grouping ───────────────────────────────────────────────────────────

function getDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (d >= todayStart) return 'Today';
  if (d >= yesterdayStart) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupExecutions(execs: N8nExecution[]): { label: string; items: N8nExecution[] }[] {
  const map = new Map<string, N8nExecution[]>();
  for (const e of execs) {
    const label = getDateLabel(e.startedAt);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

// ─── error detail modal ───────────────────────────────────────────────────────

interface ErrorDetail {
  failedNode?: string;
  message?: string;
  description?: string;
}

function parseErrorDetail(exec: N8nExecution): ErrorDetail {
  const err = exec.data?.resultData?.error;
  return {
    failedNode: err?.node?.name ?? exec.data?.resultData?.lastNodeExecuted,
    message: err?.message,
    description: err?.description,
  };
}

function nodeErrorTip(nodeName?: string): string {
  if (!nodeName) return 'Check your n8n execution logs for details.';
  if (nodeName.includes('AI Agent') || nodeName.includes('OpenAI')) return 'OpenAI API error. Check your API key and quota.';
  if (nodeName.includes('Voice') || nodeName.includes('Transcribe')) return 'Audio transcription failed. The voice note may be too long or in an unsupported format.';
  if (nodeName.includes('Image') || nodeName.includes('Describe')) return 'Image processing failed. Check OpenAI vision API access.';
  if (nodeName.includes('CRM') || nodeName.includes('Lead') || nodeName.includes('Log')) return 'CRM API call failed. Check the n8n-api-key header and CRM endpoint availability.';
  if (nodeName.includes('WhatsApp') || nodeName.includes('Send') || nodeName.includes('Meta') || nodeName.includes('Graph')) return 'WhatsApp API call failed. Check your Meta token and phone number ID.';
  if (nodeName.includes('Download') || nodeName.includes('URL')) return 'Media download failed. The file URL may have expired or be inaccessible.';
  return 'Check your n8n workflow and node credentials.';
}

interface ErrorModalProps {
  execution: N8nExecution | null;
  open: boolean;
  onClose: () => void;
}

function ErrorModal({ execution, open, onClose }: ErrorModalProps) {
  const [detail, setDetail] = useState<N8nExecution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !execution) return;
    // If we already have error data from the list, use it
    if (execution.data?.resultData?.error || execution.data?.resultData?.lastNodeExecuted) {
      setDetail(execution);
      return;
    }
    // Otherwise fetch full details
    setLoading(true);
    fetch(`/api/n8n/executions/${execution.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [open, execution]);

  useEffect(() => {
    if (!open) setDetail(null);
  }, [open]);

  const err = detail ? parseErrorDetail(detail) : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <XCircle className="size-4" />
            Execution Failed — #{execution?.id}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : err ? (
          <div className="space-y-4 text-sm">
            {err.failedNode && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Failed at node</p>
                <p className="font-mono text-foreground bg-muted/50 rounded px-2 py-1 text-xs">{err.failedNode}</p>
              </div>
            )}
            {err.message && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Error</p>
                <p className="text-red-300 bg-red-950/20 rounded px-2 py-1 text-xs font-mono break-all">{err.message}</p>
              </div>
            )}
            {err.description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Details</p>
                <p className="text-muted-foreground text-xs">{err.description}</p>
              </div>
            )}
            <div className="rounded-lg border border-amber-900/30 bg-amber-950/20 px-3 py-2">
              <p className="text-amber-300 text-xs">{nodeErrorTip(err.failedNode)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Could not load error details. Open the execution directly in n8n.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── execution row ────────────────────────────────────────────────────────────

function ExecutionRow({
  execution,
  onClick,
}: {
  execution: N8nExecution;
  onClick?: () => void;
}) {
  const tag = getActionTag(execution);
  const isError = execution.status === 'error' || execution.status === 'crashed';
  const isRunning = execution.status === 'running';

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors ${
        isError ? 'cursor-pointer hover:bg-red-950/10 hover:border-red-900/40' : ''
      }`}
      onClick={isError ? onClick : undefined}
    >
      {isError ? (
        <XCircle className="size-4 shrink-0 text-red-400" />
      ) : isRunning ? (
        <Loader2 className="size-4 shrink-0 text-primary animate-spin" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-500/70" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {execution.workflowData?.name ?? `Execution #${execution.id}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatTime(execution.startedAt)}
          {execution.stoppedAt && <> · {formatDuration(execution.startedAt, execution.stoppedAt)}</>}
          {isRunning && <> · {formatDuration(execution.startedAt)} elapsed</>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge className={`${TAG_CLASSES[tag.variant]} border text-[11px] font-medium`}>
          {tag.label}
        </Badge>
        {isError && <ChevronRight className="size-3.5 text-muted-foreground" />}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function N8nDashboardPage() {
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [errorModal, setErrorModal] = useState<N8nExecution | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch('/api/n8n/executions');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setExecutions(data.data ?? []);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to reach the n8n API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExecutions(); }, [fetchExecutions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchExecutions(), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchExecutions]);

  const todayExecs = executions.filter(e => getDateLabel(e.startedAt) === 'Today');
  const runningCount = executions.filter(e => e.status === 'running').length;
  const successCount = todayExecs.filter(e => e.status === 'success').length;
  const errorCount = todayExecs.filter(e => e.status === 'error' || e.status === 'crashed').length;

  const groups = groupExecutions(executions);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">n8n Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of workflow executions — today and yesterday.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Updated {formatTime(lastRefresh.toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(v => !v)}
            className={`border-border text-muted-foreground hover:text-foreground hover:bg-muted ${autoRefresh ? 'text-primary border-primary/40' : ''}`}
          >
            <Activity className="size-3.5" />
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); fetchExecutions(); }}
            disabled={loading}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats — today only */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{runningCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Running now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-400">{successCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Succeeded today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">{errorCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Failed today</p>
          </CardContent>
        </Card>
      </div>

      {/* Executions list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Executions</CardTitle>
          <CardDescription className="text-muted-foreground">
            All executions for today and yesterday. Click a failed execution for error details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 text-center">
              <XCircle className="size-5 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Check your n8n URL and API key in{' '}
                <a href="/settings?tab=n8n" className="text-primary underline-offset-2 hover:underline">
                  Settings → n8n
                </a>
              </p>
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="size-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No executions in the last 2 days.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(({ label, items }) => (
                <div key={label}>
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {label}
                    </p>
                    <span className="text-xs text-muted-foreground/60">
                      {items.length} execution{items.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="space-y-2">
                    {items.map(e => (
                      <ExecutionRow
                        key={e.id}
                        execution={e}
                        onClick={() => setErrorModal(e)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ExternalLink className="size-3" />
        <span>
          Meta events forward to your n8n webhook automatically.{' '}
          <a href="/settings?tab=n8n" className="text-primary hover:underline underline-offset-2">
            Configure n8n settings
          </a>
        </span>
      </div>

      {/* Error detail modal */}
      <ErrorModal
        execution={errorModal}
        open={!!errorModal}
        onClose={() => setErrorModal(null)}
      />
    </div>
  );
}
