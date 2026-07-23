'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Target } from 'lucide-react';

// Predictive Intelligence v1 — deterministic calculations over real
// account data, NOT a live AI model. Revenue forecast is a linear
// trend fit over weekly won-deal + paid-invoice totals; churn risk is
// a rule-based point score (days since contact, lost deals, overdue
// invoices). No LLM call, no per-request cost, fully explainable —
// and honest about low confidence when there isn't enough history
// yet, rather than pretending precision the data doesn't support.

interface RiskContact {
  id: string;
  name: string | null;
  phone: string;
  score: number;
  reasons: string[];
}

function since(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function linearRegression(points: number[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] ?? 0 };
  const xs = points.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = points.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (points[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

export default function PredictionsPage() {
  const { defaultCurrency } = useAuth();
  const [loading, setLoading] = useState(true);
  const [weeklyRevenue, setWeeklyRevenue] = useState<number[]>([]);
  const [pipelineForecast, setPipelineForecast] = useState(0);
  const [pipelineDealCount, setPipelineDealCount] = useState(0);
  const [riskContacts, setRiskContacts] = useState<RiskContact[]>([]);

  useEffect(() => {
    const db = createClient();
    const twelveWeeksAgo = since(84);

    Promise.all([
      db.from('deals').select('value, currency, status, updated_at, closed_at, expected_close_date, stage_id, contact_id').gte('updated_at', twelveWeeksAgo.toISOString()),
      db.from('client_invoices').select('amount, currency, status, paid_at, contact_id').gte('paid_at', twelveWeeksAgo.toISOString()),
      db.from('pipeline_stages').select('id, probability'),
      db.from('deals').select('id, value, status, expected_close_date, stage_id').eq('status', 'open'),
      db.from('contacts').select('id, name, phone, last_message_at').order('updated_at', { ascending: false }).limit(300),
      db.from('deals').select('contact_id, status, updated_at'),
      db.from('client_invoices').select('contact_id, status'),
    ]).then(([wonDealsRes, paidInvoicesRes, stagesRes, openDealsRes, contactsRes, allDealsRes, allInvoicesRes]) => {
      // --- Revenue forecast: bucket won deals + paid invoices into 12 weekly buckets
      const buckets = new Array(12).fill(0);
      const bucketOf = (iso: string) => {
        const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
        const idx = 11 - Math.floor(days / 7);
        return idx >= 0 && idx < 12 ? idx : null;
      };
      for (const d of wonDealsRes.data ?? []) {
        if (d.status !== 'won') continue;
        const when = d.closed_at ?? d.updated_at;
        const idx = bucketOf(when);
        if (idx !== null) buckets[idx] += d.value ?? 0;
      }
      for (const inv of paidInvoicesRes.data ?? []) {
        if (inv.status !== 'paid' || !inv.paid_at) continue;
        const idx = bucketOf(inv.paid_at);
        if (idx !== null) buckets[idx] += inv.amount ?? 0;
      }
      setWeeklyRevenue(buckets);

      // --- Weighted pipeline forecast: open deals * stage probability, closing within 30 days
      const stageProb = new Map((stagesRes.data ?? []).map((s) => [s.id, s.probability ?? 20]));
      const thirtyDaysOut = new Date();
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
      let forecast = 0;
      let dealCount = 0;
      for (const d of openDealsRes.data ?? []) {
        if (d.expected_close_date && new Date(d.expected_close_date) > thirtyDaysOut) continue;
        const prob = stageProb.get(d.stage_id) ?? 20;
        forecast += (d.value ?? 0) * (prob / 100);
        dealCount++;
      }
      setPipelineForecast(forecast);
      setPipelineDealCount(dealCount);

      // --- Churn risk scoring: rule-based points per contact
      const dealsByContact = new Map<string, { status: string; updated_at: string }[]>();
      for (const d of allDealsRes.data ?? []) {
        if (!d.contact_id) continue;
        const arr = dealsByContact.get(d.contact_id) ?? [];
        arr.push({ status: d.status, updated_at: d.updated_at });
        dealsByContact.set(d.contact_id, arr);
      }
      const invoicesByContact = new Map<string, string[]>();
      for (const inv of allInvoicesRes.data ?? []) {
        if (!inv.contact_id) continue;
        const arr = invoicesByContact.get(inv.contact_id) ?? [];
        arr.push(inv.status);
        invoicesByContact.set(inv.contact_id, arr);
      }

      const risks: RiskContact[] = [];
      for (const c of contactsRes.data ?? []) {
        const contactDeals = dealsByContact.get(c.id) ?? [];
        const contactInvoices = invoicesByContact.get(c.id) ?? [];
        // Only score contacts with some sales history — no signal, no score
        if (contactDeals.length === 0 && contactInvoices.length === 0) continue;

        let score = 0;
        const reasons: string[] = [];

        const daysSinceContact = c.last_message_at ? (Date.now() - new Date(c.last_message_at).getTime()) / 86_400_000 : null;
        if (daysSinceContact !== null && daysSinceContact > 30) {
          score += 50;
          reasons.push(`No message in ${Math.floor(daysSinceContact)} days`);
        } else if (daysSinceContact !== null && daysSinceContact > 14) {
          score += 30;
          reasons.push(`No message in ${Math.floor(daysSinceContact)} days`);
        }

        const hasLost = contactDeals.some((d) => d.status === 'lost');
        const hasWon = contactDeals.some((d) => d.status === 'won');
        if (hasLost && !hasWon) {
          score += 20;
          reasons.push('Has a lost deal, no won deal since');
        }

        const hasOverdue = contactInvoices.some((s) => s === 'overdue');
        if (hasOverdue) {
          score += 20;
          reasons.push('Has an overdue invoice');
        }

        score = Math.min(score, 100);
        if (score >= 30) risks.push({ id: c.id, name: c.name, phone: c.phone, score, reasons });
      }
      risks.sort((a, b) => b.score - a.score);
      setRiskContacts(risks.slice(0, 20));

      setLoading(false);
    });
  }, [defaultCurrency]);

  const weeksWithData = weeklyRevenue.filter((v) => v > 0).length;
  const { slope, intercept } = linearRegression(weeklyRevenue);
  const nextWeekForecast = Math.max(0, intercept + slope * 12);
  const last4WeeksAvg = weeklyRevenue.slice(-4).reduce((a, b) => a + b, 0) / 4;
  const pctChange = last4WeeksAvg > 0 ? ((nextWeekForecast - last4WeeksAvg) / last4WeeksAvg) * 100 : 0;
  const lowConfidence = weeksWithData < 4;

  const TrendIcon = pctChange > 5 ? TrendingUp : pctChange < -5 ? TrendingDown : Minus;
  const trendColor = pctChange > 5 ? 'text-emerald-500' : pctChange < -5 ? 'text-red-500' : 'text-muted-foreground';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Predictive Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calculated from your actual data — trend + rule-based scoring, not a live AI guess.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Crunching numbers...</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next Week Revenue Forecast</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">{formatCurrency(nextWeekForecast, defaultCurrency)}</span>
                <span className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
                  <TrendIcon className="h-4 w-4" />
                  {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}%
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {lowConfidence
                  ? `[Guessing] Only ${weeksWithData} week(s) of revenue history — treat as a rough signal, not a forecast, until more data accumulates.`
                  : `[Likely] Based on ${weeksWithData} weeks of won-deal + paid-invoice trend, vs last 4-week average of ${formatCurrency(last4WeeksAvg, defaultCurrency)}.`}
              </p>
            </div>

            <div className="card-elevated p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Weighted Pipeline (next 30 days)</p>
              <div className="mt-2 flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold text-foreground">{formatCurrency(pipelineForecast, defaultCurrency)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {pipelineDealCount} open deal(s) closing within 30 days, weighted by stage probability.
              </p>
            </div>
          </div>

          <div className="panel-float overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <p className="text-sm font-semibold text-foreground">Customers at risk</p>
              <p className="text-xs text-muted-foreground">Rule-based score: silence 14-30+ days, lost deal with no win since, overdue invoice.</p>
            </div>
            {riskContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No at-risk customers detected</p>
                <p className="text-xs text-muted-foreground">Nobody currently scores above the risk threshold</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {riskContacts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{r.name ?? r.phone}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.reasons.join(' · ')}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        r.score >= 60 ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      {r.score >= 60 ? 'High' : 'Medium'} risk · {r.score}
                    </span>
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
