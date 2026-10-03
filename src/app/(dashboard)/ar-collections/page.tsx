'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Loader2, RefreshCw, Search, ExternalLink, Mail, AlertTriangle,
  XCircle, Users, Wallet, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/currency';
import type { ArTrackerRow } from '@/types';

// AshWheelz's own Odoo instance — opening the real invoice record here
// (not a copy) lets the team print/download the actual PDF themselves.
// We never store or serve Odoo credentials from this dashboard.
const ODOO_URL = 'https://odoo.ashwheelz.com';
function odooInvoiceLink(invoiceId: string): string {
  return `${ODOO_URL}/web#model=account.move&view_type=form&id=${invoiceId}`;
}

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  sent: 'Emailed',
  escalated_to_admin: 'Escalated',
  failed_send: 'Send Failed',
};
const STATUS_CLASS: Record<string, string> = {
  sent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  escalated_to_admin: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  failed_send: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const TONE_LABEL: Record<string, string> = {
  soft: 'Soft',
  firm: 'Firm',
  final: 'Final',
  demand: 'Demand',
  escalated: 'Escalated',
  no_email: 'No Email On File',
};
const TONE_CLASS: Record<string, string> = {
  soft: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  firm: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  final: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  demand: 'bg-red-500/10 text-red-400 border-red-500/30',
  escalated: 'bg-red-500/10 text-red-400 border-red-500/30',
  no_email: 'bg-muted/60 text-muted-foreground border-border',
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function ArCollectionsPage() {
  const [rows, setRows] = useState<ArTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'escalated_to_admin' | 'failed_send'>('all');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/n8n/ar-tracker');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setRows(data.data ?? []);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError('Failed to reach the n8n API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== 'all') r = r.filter((x) => x.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        x.client_name?.toLowerCase().includes(q) ||
        x.client_email?.toLowerCase().includes(q) ||
        x.invoice_number?.toLowerCase().includes(q),
      );
    }
    return r;
  }, [rows, statusFilter, search]);

  // Reset to page 0 whenever the filtered set changes shape, so the
  // user never lands on an empty page after narrowing a filter.
  useEffect(() => { setPage(0); }, [statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Summary stats — over the full tracker, not just the current filter/page.
  const uniqueClients = new Set(rows.map((r) => r.client_name)).size;
  const sentRows = rows.filter((r) => r.status === 'sent');
  const escalatedRows = rows.filter((r) => r.status === 'escalated_to_admin');
  const failedRows = rows.filter((r) => r.status === 'failed_send');
  const sentSar = sentRows.reduce((s, r) => s + (r.sar_amount || 0), 0);
  const escalatedSar = escalatedRows.reduce((s, r) => s + (r.sar_amount || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">AR Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live log from the AR automation — every invoice it has chased, who got emailed, who got escalated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Updated {lastRefresh.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={loading}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{rows.length}</div>
            <p className="text-sm text-muted-foreground mt-1">Invoices tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 text-2xl font-bold text-foreground">
              <Users className="size-4 text-muted-foreground" />{uniqueClients}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-400">{sentRows.length}</div>
            <p className="text-sm text-muted-foreground mt-1">Emailed · {formatCurrency(sentSar, 'SAR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-400">{escalatedRows.length}</div>
            <p className="text-sm text-muted-foreground mt-1">Escalated · {formatCurrency(escalatedSar, 'SAR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">{failedRows.length}</div>
            <p className="text-sm text-muted-foreground mt-1">Send failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search client, email, or invoice #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground w-72"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          {([
            ['all', 'All'],
            ['sent', 'Emailed'],
            ['escalated_to_admin', 'Escalated'],
            ['failed_send', 'Failed'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                statusFilter === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="panel-float overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading AR activity...</span>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-4 text-center m-4">
            <XCircle className="size-5 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-300">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Check your n8n URL and API key in{' '}
              <a href="/settings?tab=n8n" className="text-primary underline-offset-2 hover:underline">
                Settings → n8n
              </a>
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No activity matches this filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Client</TableHead>
                  <TableHead className="text-muted-foreground">Invoice</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Tone</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Last Touched</TableHead>
                  <TableHead className="text-muted-foreground">Reply</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell>
                      <div className="text-sm font-medium text-foreground max-w-[220px] truncate" title={r.client_name}>
                        {r.client_name || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground max-w-[220px] truncate">
                        {r.client_email || 'no email on file'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground font-mono text-xs">
                      {r.invoice_number || `#${r.invoice_id}`}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-foreground">
                      {formatCurrency(r.sar_amount, 'SAR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${TONE_CLASS[r.tone] ?? ''}`}>
                        {TONE_LABEL[r.tone] ?? r.tone}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_CLASS[r.status] ?? ''}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(r.sent_date ?? r.last_updated)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.reply_received === 'yes' ? (
                        <div>
                          <span className="text-foreground">{r.reply_intent ?? 'Replied'}</span>
                          {r.promise_date && (
                            <div className="text-muted-foreground">
                              Promised {fmtDate(r.promise_date)}
                              {r.promise_amount ? ` · ${formatCurrency(r.promise_amount, 'SAR')}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No reply</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <a
                        href={odooInvoiceLink(r.invoice_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 whitespace-nowrap"
                        title="Open this invoice in Odoo to view or print the real PDF"
                      >
                        Invoice <ExternalLink className="size-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {!loading && !error && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
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

      {!loading && !error && failedRows.length > 0 && (
        <div className="rounded-lg border border-amber-900/30 bg-amber-950/20 px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-xs">
            {failedRows.length} invoice{failedRows.length !== 1 ? 's' : ''} failed to send — the automation will retry on its next scheduled run.
          </p>
        </div>
      )}

      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Wallet className="size-3" />
        <span>
          This log covers invoices the AR automation has actually chased since go-live (2026-09-28) — it is activity, not the full Odoo receivables book.
        </span>
      </div>
    </div>
  );
}
