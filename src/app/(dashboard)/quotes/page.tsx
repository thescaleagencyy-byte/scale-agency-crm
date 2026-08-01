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
  Search, ChevronLeft, ChevronRight, FileText, Loader2, ExternalLink,
  Send, AlertTriangle, PhoneOff, PauseCircle,
} from 'lucide-react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { SkeletonCard, Skeleton } from '@/components/dashboard/skeleton';
import { EmptyState } from '@/components/dashboard/empty-state';
import type { Quote } from '@/types';

type QuoteStatus = Quote['status'];
const STATUSES: QuoteStatus[] = ['sent', 'failed', 'no_number', 'received'];
const STATUS_LABEL: Record<QuoteStatus, string> = {
  sent: 'Accepted by Meta',
  failed: 'Failed',
  no_number: 'No Number',
  received: 'Received',
};
const STATUS_CLASS: Record<QuoteStatus, string> = {
  sent: 'bg-muted text-muted-foreground border-border',
  failed: 'bg-red-500/15 text-red-600 border-red-500/30',
  no_number: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  received: 'bg-muted text-muted-foreground border-border',
};

// Real outcome from Meta's async status webhook. `status: 'sent'` with
// delivery_status null means the API call was accepted but no delivery
// confirmation has arrived yet — deliberately NOT labeled "Sent" to avoid
// repeating the old fake-badge bug (see 051_quotes_delivery_status.sql).
type DeliveryStatus = NonNullable<Quote['delivery_status']>;
const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to deliver',
};
const DELIVERY_CLASS: Record<DeliveryStatus, string> = {
  sent: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  delivered: 'bg-green-500/15 text-green-600 border-green-500/30',
  read: 'bg-green-500/15 text-green-600 border-green-500/30',
  failed: 'bg-red-500/15 text-red-600 border-red-500/30',
};
const PAGE_SIZE = 25;

export default function QuotesPage() {
  const { profile } = useAuth();
  const accountId = profile?.account_id ?? null;
  // null = not loaded yet. Automation is treated as ON until we
  // actually load a row saying otherwise — matches the fail-open
  // default on the n8n side (no row = enabled).
  const [automationEnabled, setAutomationEnabled] = useState<boolean | null>(null);
  const [togglingAutomation, setTogglingAutomation] = useState(false);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);
  // Global status counts for the stat tiles — independent of the
  // current search/filter so the tiles always describe the whole log.
  const [counts, setCounts] = useState<Record<QuoteStatus, number> | null>(null);
  // Real delivery-webhook counts, separate from the `status` column
  // counts above — see 051_quotes_delivery_status.sql for why these
  // can't be derived from `status` alone.
  const [realDelivered, setRealDelivered] = useState<number | null>(null);
  const [realFailedAsync, setRealFailedAsync] = useState<number | null>(null);

  // Same debounce convention as the leads page — one query per pause,
  // not one per keystroke.
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
        .from('quotes')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        // Same sanitizing as the leads page: , ( ) are PostgREST or()
        // syntax, % _ are LIKE wildcards.
        const term = debouncedSearch
          .trim()
          .replace(/[,()]/g, ' ')
          .replace(/[%_]/g, '\\$&');
        query = query.or(
          `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,company.ilike.%${term}%,sender_email.ilike.%${term}%,pdf_filename.ilike.%${term}%`
        );
      }

      const { data, count, error } = await query;
      if (error) toast.error(error.message);
      else { setQuotes((data as Quote[]) ?? []); setTotal(count ?? 0); }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from('quote_automation_control')
      .select('enabled')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error(error); return; }
        setAutomationEnabled(data?.enabled ?? true);
      });
  }, [accountId]);

  async function toggleAutomation(next: boolean) {
    if (!accountId) return;
    setTogglingAutomation(true);
    const prev = automationEnabled;
    setAutomationEnabled(next); // optimistic
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('quote_automation_control')
        .upsert(
          {
            account_id: accountId,
            enabled: next,
            updated_by: profile?.email ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' }
        );
      if (error) throw error;
      toast.success(next ? 'Automation resumed' : 'Automation paused — new quote emails will not be sent');
    } catch (e) {
      setAutomationEnabled(prev);
      toast.error(e instanceof Error ? e.message : 'Failed to update automation status');
    } finally {
      setTogglingAutomation(false);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    Promise.all(
      STATUSES.map(s =>
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', s)
      )
    ).then(results => {
      const next = {} as Record<QuoteStatus, number>;
      STATUSES.forEach((s, i) => { next[s] = results[i].count ?? 0; });
      setCounts(next);
    });
    supabase.from('quotes').select('id', { count: 'exact', head: true })
      .in('delivery_status', ['delivered', 'read'])
      .then(({ count }) => setRealDelivered(count ?? 0));
    supabase.from('quotes').select('id', { count: 'exact', head: true })
      .eq('delivery_status', 'failed')
      .then(({ count }) => setRealFailedAsync(count ?? 0));
  }, []);

  // Private bucket — mint a short-lived signed URL on demand instead of
  // storing public links.
  async function openPdf(quote: Quote) {
    if (!quote.pdf_path) return;
    // Open synchronously on click, before the signed-URL await — a
    // window.open() after an await falls outside the browser's "user
    // gesture" window and can get silently popup-blocked into a blank
    // tab (hit this in the inbox's copy of this pattern).
    const tab = window.open('', '_blank', 'noopener');
    setOpeningPdf(quote.id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from('quote-pdfs')
        .createSignedUrl(quote.pdf_path, 60 * 10);
      if (error || !data?.signedUrl) {
        tab?.close();
        toast.error('Could not open PDF');
        return;
      }
      if (tab) tab.location.href = data.signedUrl;
    } finally {
      setOpeningPdf(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const grandTotal = counts ? STATUSES.reduce((s, k) => s + counts[k], 0) : 0;
  const deliveryRate = counts && grandTotal > 0 && realDelivered !== null
    ? Math.round((realDelivered / grandTotal) * 100)
    : null;
  // A send Meta accepted but the async webhook later reported failed
  // (e.g. 131042 payment issue) — counted separately from `status: failed`
  // since the API call itself succeeded.
  const totalFailed = counts ? counts.failed + (realFailedAsync ?? 0) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quote emails picked up by the automation and delivered to customers on WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <span className="text-sm text-foreground">Automation</span>
          <Switch
            checked={automationEnabled ?? true}
            disabled={!accountId || togglingAutomation}
            onCheckedChange={(v) => toggleAutomation(!!v)}
            aria-label={automationEnabled ? 'Pause automation' : 'Resume automation'}
          />
          <span className="text-xs text-muted-foreground w-14">
            {automationEnabled === null ? '…' : automationEnabled ? 'Running' : 'Paused'}
          </span>
        </div>
      </div>

      {automationEnabled === false && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-600">
          <PauseCircle className="h-4 w-4 shrink-0" />
          Automation paused. New quote emails will be skipped — nothing sent to customers until you flip this back on.
        </div>
      )}

      {counts === null ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            title="Quotes Processed"
            value={String(grandTotal)}
            icon={FileText}
            subtitle="All time"
          />
          <MetricCard
            title="Delivered on WhatsApp"
            value={realDelivered === null ? '—' : String(realDelivered)}
            icon={Send}
            subtitle={deliveryRate === null ? '—' : `${deliveryRate}% delivery rate`}
          />
          <MetricCard
            title="Failed Sends"
            value={String(totalFailed)}
            icon={AlertTriangle}
            subtitle={totalFailed > 0 ? 'Needs attention' : 'All clear'}
          />
          <MetricCard
            title="No Number Found"
            value={String(counts.no_number)}
            icon={PhoneOff}
            subtitle="Sent manually by sales"
          />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground w-64"
          />
        </div>
        <div className="flex gap-1">
          {(['all', ...STATUSES] as string[]).map(s => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(0); }}
              className={[
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s as QuoteStatus]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filterStatus === 'all' && !debouncedSearch ? 'No quotes yet' : 'No quotes match'}
            hint={filterStatus === 'all' && !debouncedSearch
              ? 'Quote emails processed by the automation appear here'
              : 'Try a different search or status filter'}
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Customer</TableHead>
                <TableHead className="text-muted-foreground">Company</TableHead>
                <TableHead className="text-muted-foreground">Quote PDF</TableHead>
                <TableHead className="text-muted-foreground">Sent By</TableHead>
                <TableHead className="text-muted-foreground">WhatsApp</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map(quote => (
                <TableRow key={quote.id} className="border-border transition-colors hover:bg-muted/40">
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">{quote.customer_name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{quote.customer_phone ?? 'no number found'}</div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{quote.company ?? '—'}</TableCell>
                  <TableCell>
                    {quote.pdf_path ? (
                      <button
                        onClick={() => openPdf(quote)}
                        disabled={openingPdf === quote.id}
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
                        title="Open PDF"
                      >
                        {openingPdf === quote.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <FileText className="h-3.5 w-3.5" />}
                        <span className="max-w-[180px] truncate">{quote.pdf_filename ?? 'quote.pdf'}</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">{quote.pdf_filename ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{quote.sender_email ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {quote.status === 'sent' ? (
                        quote.delivery_status ? (
                          <Badge variant="outline" className={`text-xs w-fit ${DELIVERY_CLASS[quote.delivery_status]}`}>
                            {DELIVERY_LABEL[quote.delivery_status]}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs w-fit bg-yellow-500/15 text-yellow-600 border-yellow-500/30">
                            Awaiting confirmation
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className={`text-xs w-fit ${STATUS_CLASS[quote.status] ?? ''}`}>
                          {STATUS_LABEL[quote.status] ?? quote.status}
                        </Badge>
                      )}
                      {((quote.status === 'failed' && quote.error_detail) ||
                        (quote.delivery_status === 'failed' && quote.error_detail)) && (
                        <span className="text-[10px] text-muted-foreground max-w-[200px] truncate" title={quote.error_detail ?? undefined}>
                          {quote.error_detail}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(quote.created_at).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
