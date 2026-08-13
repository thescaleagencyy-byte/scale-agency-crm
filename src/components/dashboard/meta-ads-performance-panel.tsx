"use client"

import Link from 'next/link'
import { ArrowRight, Megaphone, MousePointerClick, Target } from 'lucide-react'
import type { MetaAdsPerformance } from '@/lib/dashboard/types'
import { formatCurrency } from '@/lib/currency'
import { MetricCard } from './metric-card'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface MetaAdsPerformancePanelProps {
  data: MetaAdsPerformance | null
  loading: boolean
}

/**
 * Meta Ads Analytics section — 3 metric cards + a campaign table.
 * Table over chart: matches the abandoned 2026-06-30 attempt and is
 * denser for comparing campaigns side by side. No top-level ROAS
 * metric card — with deal-form.tsx's conversation_id fix only
 * forward-looking, ROAS is structurally sparse at launch; it's shown
 * as an honest "—" table column instead of an authoritative KPI.
 */
export function MetaAdsPerformancePanel({ data, loading }: MetaAdsPerformancePanelProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">Ad Performance</h2>
          <p className="text-xs text-muted-foreground">Meta ad spend, joined against leads and won deals</p>
        </div>
        <Link
          href="/meta-ads"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Full report
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No ad data yet"
          hint="Connect Meta Ads in Settings → Integrations, then the daily sync will populate campaign performance here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Total Ad Spend"
              value={formatCurrency(data.totalSpend, data.currency)}
              icon={Megaphone}
              variant="hero"
            />
            <MetricCard
              title="Qualified Leads from Ads"
              value={String(data.totalQualifiedLeads)}
              icon={Target}
              variant="tint1"
            />
            <MetricCard
              title="Cost per Qualified Lead"
              value={data.costPerQualifiedLead !== null ? formatCurrency(data.costPerQualifiedLead, data.currency) : '—'}
              icon={MousePointerClick}
              variant="tint2"
            />
          </div>

          <div className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3 text-right">Spend</th>
                    <th className="px-4 py-3 text-right">Impressions</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">Conversations</th>
                    <th className="px-4 py-3 text-right">Qualified Leads</th>
                    <th className="px-4 py-3 text-right">Cost/Lead</th>
                    <th className="px-4 py-3 text-right">Won Value</th>
                    <th className="px-4 py-3 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.campaigns.map((c) => (
                    <tr key={c.campaignId}>
                      <td className="max-w-[220px] truncate px-4 py-3 font-medium text-foreground">{c.campaignName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.spend, c.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.impressions.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.ctr !== null ? `${(c.ctr * 100).toFixed(2)}%` : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.adConversations}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.qualifiedLeads}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.costPerQualifiedLead !== null ? formatCurrency(c.costPerQualifiedLead, c.currency) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.wonValue, c.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.roas !== null ? `${c.roas.toFixed(2)}x` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
