'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { Loader2, TrendingUp, Briefcase, Receipt } from 'lucide-react';

interface RevenueEvent {
  id: string;
  kind: 'deal' | 'invoice';
  label: string;
  amount: number;
  currency: string;
  when: string;
  contactName: string | null;
  contactPhone: string | null;
}

function since(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() - days);
  return t.toISOString();
}

export default function RevenuePage() {
  const { defaultCurrency } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<RevenueEvent[]>([]);

  useEffect(() => {
    const db = createClient();
    Promise.all([
      db
        .from('deals')
        .select('id, title, value, currency, updated_at, contact:contacts(name, phone)')
        .eq('status', 'won')
        .order('updated_at', { ascending: false })
        .limit(200),
      db
        .from('client_invoices')
        .select('id, title, amount, currency, paid_at, contact:contacts(name, phone)')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(200),
    ]).then(([dealsRes, invoicesRes]) => {
      type ContactRef = { name: string | null; phone: string } | { name: string | null; phone: string }[] | null;
      const oneContact = (c: ContactRef) => (Array.isArray(c) ? c[0] ?? null : c);

      const dealEvents: RevenueEvent[] = (dealsRes.data ?? []).map((d) => {
        const c = oneContact(d.contact as ContactRef);
        return {
          id: `deal-${d.id}`,
          kind: 'deal',
          label: d.title,
          amount: d.value ?? 0,
          currency: d.currency ?? defaultCurrency,
          when: d.updated_at,
          contactName: c?.name ?? null,
          contactPhone: c?.phone ?? null,
        };
      });
      const invoiceEvents: RevenueEvent[] = (invoicesRes.data ?? []).map((i) => {
        const c = oneContact(i.contact as ContactRef);
        return {
          id: `invoice-${i.id}`,
          kind: 'invoice',
          label: i.title,
          amount: i.amount ?? 0,
          currency: i.currency ?? defaultCurrency,
          when: i.paid_at ?? '',
          contactName: c?.name ?? null,
          contactPhone: c?.phone ?? null,
        };
      });

      setEvents([...dealEvents, ...invoiceEvents].sort((a, b) => (b.when || '').localeCompare(a.when || '')));
      setLoading(false);
    });
  }, [defaultCurrency]);

  const d7 = since(7);
  const d30 = since(30);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const sumSince = (iso: string) => events.filter((e) => e.when >= iso).reduce((s, e) => s + e.amount, 0);
  const revenueToday = sumSince(todayIso);
  const revenue7d = sumSince(d7);
  const revenue30d = sumSince(d30);
  const revenueTotal = events.reduce((s, e) => s + e.amount, 0);

  const StatCard = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
    <div className="card-elevated p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Won deals + paid invoices combined — the same definition the Revenue Analyst AI Employee uses
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading revenue...</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Today" value={formatCurrency(revenueToday, defaultCurrency)} sub="won deals + paid invoices" />
            <StatCard label="Last 7 days" value={formatCurrency(revenue7d, defaultCurrency)} sub="won deals + paid invoices" />
            <StatCard label="Last 30 days" value={formatCurrency(revenue30d, defaultCurrency)} sub="won deals + paid invoices" />
            <StatCard label="All-time" value={formatCurrency(revenueTotal, defaultCurrency)} sub={`${events.length} revenue events`} />
          </div>

          <div className="panel-float overflow-hidden">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No revenue yet</p>
                <p className="text-xs text-muted-foreground">Won deals and paid invoices will show up here</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
                    <AvatarStack avatars={[{ label: e.contactName || e.contactPhone || '?' }]} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{e.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.contactName ?? e.contactPhone ?? 'Unknown contact'} · {e.when ? new Date(e.when).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {e.kind === 'deal' ? <Briefcase className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                      {e.kind === 'deal' ? 'Deal' : 'Invoice'}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(e.amount, e.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
