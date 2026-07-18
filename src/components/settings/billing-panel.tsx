'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, CreditCard, Landmark, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';

interface Subscription {
  plan_name: string;
  amount: number;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  current_period_end: string | null;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  issued_at: string;
  paid_at: string | null;
}

interface UsageMetric {
  used: number | null;
  limit: number | null;
}

interface Usage {
  seats: UsageMetric;
  messages: UsageMetric;
}

interface PaymentInstructions {
  bankDetails: string | null;
  jazzCashNumber: string | null;
  easypaisaNumber: string | null;
}

function UsageBar({ label, usage }: { label: string; usage: UsageMetric }) {
  const unlimited = usage.limit === null;
  const pct = unlimited || !usage.used ? 0 : Math.min(100, (usage.used / usage.limit!) * 100);
  const nearLimit = !unlimited && usage.used != null && usage.used / usage.limit! >= 0.9;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium text-foreground">
          {usage.used ?? '—'} {unlimited ? '' : `/ ${usage.limit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${nearLimit ? 'bg-red-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<Subscription['status'], string> = {
  trialing: 'bg-amber-500/15 text-amber-500',
  active: 'bg-primary/10 text-primary',
  past_due: 'bg-orange-500/15 text-orange-500',
  canceled: 'bg-red-500/15 text-red-500',
};

const UPGRADE_PLANS = ['starter', 'growth', 'enterprise'] as const;

export function BillingPanel() {
  const canManage = useCan('manage-billing');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<(typeof UPGRADE_PLANS)[number]>('starter');
  const [cardLoading, setCardLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<{ reference: string } | null>(null);
  const [payInstructions, setPayInstructions] = useState<PaymentInstructions | null>(null);

  function refresh() {
    fetch('/api/billing')
      .then((r) => r.json())
      .then((data) => {
        setSubscription(data.subscription ?? null);
        setInvoices(data.invoices ?? []);
        setUsage(data.usage ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  function openUpgradeDialog() {
    setManualResult(null);
    setDialogOpen(true);
    if (!payInstructions) {
      fetch('/api/billing/payment-instructions').then((r) => r.json()).then(setPayInstructions).catch(() => {});
    }
  }

  async function payByCard() {
    setCardLoading(true);
    const res = await fetch('/api/billing/checkout', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Card payment is not connected yet');
      setCardLoading(false);
      return;
    }
    if (json.url) window.location.href = json.url;
    setCardLoading(false);
  }

  async function requestManualUpgrade() {
    setManualLoading(true);
    const res = await fetch('/api/billing/request-upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_name: selectedPlan }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Could not create upgrade request');
      setManualLoading(false);
      return;
    }
    setManualResult({ reference: json.reference });
    refresh();
    setManualLoading(false);
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Billing"
        description="Current plan and invoice history for this workspace."
      />

      {subscription && (
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground capitalize">{subscription.plan_name} plan</p>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[subscription.status]}`}>
                {subscription.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {subscription.amount > 0
                ? `${subscription.currency} ${subscription.amount.toLocaleString()} / ${subscription.billing_interval === 'monthly' ? 'mo' : 'yr'}`
                : 'Free'}
            </p>
            {subscription.current_period_end && (
              <p className="text-xs text-muted-foreground">
                Renews {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
          {canManage && (
            <Button onClick={openUpgradeDialog} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <CreditCard className="h-4 w-4 mr-2" />
              Upgrade plan
            </Button>
          )}
        </div>
      )}
      {!canManage && (
        <p className="text-xs text-muted-foreground">Only the workspace owner can change plans.</p>
      )}

      {usage && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">Usage this month</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <UsageBar label="Team seats" usage={usage.seats} />
            <UsageBar label="WhatsApp messages sent" usage={usage.messages} />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Invoices</p>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left text-xs text-muted-foreground px-4 py-2.5 font-medium">Date</th>
                <th className="text-right text-xs text-muted-foreground px-4 py-2.5 font-medium">Amount</th>
                <th className="text-right text-xs text-muted-foreground px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-foreground">{new Date(inv.issued_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right text-foreground">{inv.currency} {inv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-xs font-medium capitalize ${inv.status === 'paid' ? 'text-primary' : inv.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade plan</DialogTitle>
            <DialogDescription>Choose a plan, then pay by card or bank transfer.</DialogDescription>
          </DialogHeader>

          {manualResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-foreground">
                  Request created. Reference <span className="font-mono font-semibold">{manualResult.reference}</span> —
                  use it as your payment note. We'll confirm your price and activate the plan once payment is received.
                </p>
              </div>
              <div className="space-y-2">
                {payInstructions?.bankDetails && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-foreground">{payInstructions.bankDetails}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => copyText(payInstructions.bankDetails!)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
                {payInstructions?.jazzCashNumber && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-foreground">JazzCash: {payInstructions.jazzCashNumber}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => copyText(payInstructions.jazzCashNumber!)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
                {payInstructions?.easypaisaNumber && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-foreground">Easypaisa: {payInstructions.easypaisaNumber}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => copyText(payInstructions.easypaisaNumber!)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
                {payInstructions && !payInstructions.bankDetails && !payInstructions.jazzCashNumber && !payInstructions.easypaisaNumber && (
                  <p className="text-xs text-muted-foreground">No payment methods configured yet — contact us directly to complete payment.</p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setDialogOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {UPGRADE_PLANS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPlan(p)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                      selectedPlan === p
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={payByCard} disabled={cardLoading} className="justify-start">
                  {cardLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  Pay by card
                </Button>
                <Button type="button" variant="outline" onClick={requestManualUpgrade} disabled={manualLoading} className="justify-start">
                  {manualLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Landmark className="h-4 w-4 mr-2" />}
                  Bank / JazzCash / Easypaisa
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Card payments require a connected Stripe account. Local payment methods are confirmed manually.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
