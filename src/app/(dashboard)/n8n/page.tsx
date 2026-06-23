'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { N8nExecution } from '@/types';

type ExecutionStatus = N8nExecution['status'];

const STATUS_CONFIG: Record<ExecutionStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  error: {
    label: 'Error',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
  crashed: {
    label: 'Crashed',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
  running: {
    label: 'Running',
    icon: Activity,
    className: 'bg-primary/10 text-primary border-primary/30',
  },
  waiting: {
    label: 'Waiting',
    icon: Clock,
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
};

function formatDuration(startedAt: string, stoppedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function N8nDashboardPage() {
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch('/api/n8n/executions?limit=25');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setExecutions(data.data ?? []);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to reach the n8n API.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  // Auto-refresh every 15 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchExecutions(), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchExecutions]);

  const runningCount = executions.filter((e) => e.status === 'running').length;
  const successCount = executions.filter((e) => e.status === 'success').length;
  const errorCount = executions.filter((e) => e.status === 'error' || e.status === 'crashed').length;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">n8n Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of your n8n workflow executions, synced with Meta webhooks.
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
            onClick={() => setAutoRefresh((v) => !v)}
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

      {/* Stats */}
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
            <p className="text-sm text-muted-foreground mt-1">Succeeded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">{errorCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Executions list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Recent Executions</CardTitle>
          <CardDescription className="text-muted-foreground">
            Last 25 executions across all workflows.
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
              <p className="text-sm">No executions yet. Send a WhatsApp message to trigger your workflow.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map((execution) => {
                const cfg = STATUS_CONFIG[execution.status] ?? STATUS_CONFIG.waiting;
                const Icon = cfg.icon;
                return (
                  <div
                    key={execution.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <Icon className={`size-4 shrink-0 ${cfg.className.split(' ').find((c) => c.startsWith('text-'))}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {execution.workflowData?.name ?? `Execution ${execution.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(execution.startedAt)}
                        {execution.stoppedAt && (
                          <> · {formatDuration(execution.startedAt, execution.stoppedAt)}</>
                        )}
                        {execution.status === 'running' && (
                          <> · {formatDuration(execution.startedAt)} elapsed</>
                        )}
                      </p>
                    </div>
                    <Badge className={`${cfg.className} border text-[11px] font-medium`}>
                      {cfg.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ExternalLink className="size-3" />
        <span>
          Meta events are forwarded to your n8n webhook trigger automatically.{' '}
          <a href="/settings?tab=n8n" className="text-primary hover:underline underline-offset-2">
            Configure n8n settings
          </a>
        </span>
      </div>
    </div>
  );
}
