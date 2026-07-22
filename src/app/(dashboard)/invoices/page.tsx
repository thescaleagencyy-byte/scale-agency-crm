'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { Search, ChevronLeft, ChevronRight, Loader2, Receipt } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';

interface InvoiceRow {
  id: string;
  title: string;
  amount: number;
  currency: string;
  due_date: string | null;
  status: 'unpaid' | 'paid' | 'overdue' | 'cancelled';
  paid_at: string | null;
  created_at: string;
  contact: { name: string | null; phone: string } | null;
}

const STATUSES = ['unpaid', 'overdue', 'paid', 'cancelled'] as const;
const STATUS_LABEL: Record<string, string> = { unpaid: 'Unpaid', overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled' };
const STATUS_CLASS: Record<string, string> = {
  unpaid: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  overdue: 'bg-red-500/15 text-red-600 border-red-500/30',
  paid: 'bg-green-500/15 text-green-600 border-green-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
};
const PAGE_SIZE = 25;

export default function InvoicesPage() {
  const { defaultCurrency } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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
        .from('client_invoices')
        .select('id, title, amount, currency, due_date, status, paid_at, created_at, contact:contacts(name, phone)', { count: 'exact' })
        .order('due_date', { ascending: true, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        query = query.ilike('title', `%${debouncedSearch.trim().replace(/[%_]/g, '\\$&')}%`);
      }

      const { data, count, error } = await query;
      if (error) toast.error(error.message);
      else {
        setInvoices(
          ((data ?? []) as unknown[]).map((r) => {
            const row = r as Omit<InvoiceRow, 'contact'> & { contact: InvoiceRow['contact'] | InvoiceRow['contact'][] };
            return { ...row, contact: Array.isArray(row.contact) ? row.contact[0] ?? null : row.contact };
          }),
        );
        setTotal(count ?? 0);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    const supabase = createClient();
    const { error } = await supabase
      .from('client_invoices')
      .update({ status, updated_at: new Date().toISOString(), paid_at: status === 'paid' ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) toast.error('Update failed');
    else {
      setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: status as InvoiceRow['status'] } : i)));
      toast.success(`Marked ${STATUS_LABEL[status]}`);
    }
    setUpdating(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const unpaidTotal = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total} invoices · {formatCurrency(unpaidTotal, defaultCurrency)} unpaid on this page
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground w-64"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          {(['all', ...STATUSES] as string[]).map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(0); }}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filterStatus === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-float overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading invoices...</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No invoices yet</p>
            <p className="text-xs text-muted-foreground">Invoices tracked here, or ask the Finance Clerk AI Employee to create one</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Contact</TableHead>
                <TableHead className="text-muted-foreground">Title</TableHead>
                <TableHead className="text-muted-foreground">Amount</TableHead>
                <TableHead className="text-muted-foreground">Due Date</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <AvatarStack avatars={[{ label: inv.contact?.name || inv.contact?.phone || '?' }]} size="md" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{inv.contact?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{inv.contact?.phone}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{inv.title}</TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{formatCurrency(inv.amount, inv.currency)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_CLASS[inv.status] ?? ''}`}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updating === inv.id}
                        onClick={() => updateStatus(inv.id, 'paid')}
                      >
                        {updating === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark Paid'}
                      </Button>
                    )}
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
    </div>
  );
}
