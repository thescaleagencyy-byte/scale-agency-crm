"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Megaphone,
  MousePointerClick,
  Target,
  TrendingUp,
  Eye,
  BarChart3,
  Percent,
  DollarSign,
  Trophy,
} from 'lucide-react'
import { loadMetaAdsCampaignPerformance, loadMetaAdsDailySeries } from '@/lib/meta-ads/rollup'
import type { MetaAdsPerformance, MetaAdsDailyPoint } from '@/lib/dashboard/types'
import { formatCurrency } from '@/lib/currency'
import { MetricCard } from '@/components/dashboard/metric-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'
import { SpendTrendChart } from '@/components/meta-ads/spend-trend-chart'
import { AdFunnel } from '@/components/meta-ads/ad-funnel'
import { cn } from '@/lib/utils'

type RangeDays = 7 | 30 | 90

export default function MetaAdsPage() {
  const [range, setRange] = useState<RangeDays>(30)
  const [performance, setPerformance] = useState<MetaAdsPerformance | null>(null)
  const [performanceLoading, setPerformanceLoading] = useState(true)
  const [daily, setDaily] = useState<MetaAdsDailyPoint[] | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)

  // Fetch-only — no synchronous setState here. Initial load relies on
  // the useState(true) defaults for the loading flags; range switches
  // reset them explicitly in handleRangeChange below (a plain event
  // callback, not an effect body), same split the main dashboard's
  // ConversationsChart range switcher uses.
  const loadAll = useCallback((rangeDays: RangeDays) => {
    const db = createClient()

    void loadMetaAdsCampaignPerformance(db, rangeDays)
      .then((p) => setPerformance(p))
      .catch((err) => console.error('[meta-ads] performance failed:', err))
      .finally(() => setPerformanceLoading(false))

    void loadMetaAdsDailySeries(db, rangeDays)
      .then((s) => setDaily(s))
      .catch((err) => console.error('[meta-ads] daily series failed:', err))
      .finally(() => setDailyLoading(false))
  }, [])

  useEffect(() => {
    loadAll(range)
    // Only runs once on mount — range changes are handled by
    // handleRangeChange so the loading-flag reset stays out of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      setPerformanceLoading(true)
      setDailyLoading(true)
      loadAll(r)
    },
    [loadAll],
  )

  const currency = performance?.currency ?? 'USD'
  const hasData = (performance?.campaigns.length ?? 0) > 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Meta Ads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real ad spend, joined against your actual leads and won deals — no need to open Ads Manager.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          {[7, 30, 90].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRangeChange(r as RangeDays)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {performanceLoading || !performance ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : !hasData ? (
        <EmptyState
          icon={Megaphone}
          title="No ad data yet"
          hint="Connect Meta Ads in Settings → Integrations, then the daily sync will populate this page."
        />
      ) : (
        <>
          {/* Headline outcome metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              title="Total Ad Spend"
              value={formatCurrency(performance.totalSpend, currency)}
              icon={Megaphone}
              variant="hero"
            />
            <MetricCard
              title="Qualified Leads"
              value={String(performance.totalQualifiedLeads)}
              icon={Target}
              variant="tint1"
              subtitle={`${performance.totalConversations} total conversations`}
            />
            <MetricCard
              title="Cost per Qualified Lead"
              value={performance.costPerQualifiedLead !== null ? formatCurrency(performance.costPerQualifiedLead, currency) : '—'}
              icon={DollarSign}
              variant="tint2"
            />
            <MetricCard
              title="ROAS"
              value={performance.roas !== null ? `${performance.roas.toFixed(2)}x` : '—'}
              icon={Trophy}
              variant="tint3"
              subtitle={`${formatCurrency(performance.totalWonValue, currency)} won`}
            />
          </div>

          {/* Ad-metric stat strip — the raw Ads Manager numbers, denser than the outcome cards above */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile icon={Eye} label="Impressions" value={performance.totalImpressions.toLocaleString()} />
            <StatTile icon={MousePointerClick} label="Clicks" value={performance.totalClicks.toLocaleString()} />
            <StatTile icon={Percent} label="CTR" value={performance.ctr !== null ? `${(performance.ctr * 100).toFixed(2)}%` : '—'} />
            <StatTile icon={BarChart3} label="Cost per Click" value={performance.cpc !== null ? formatCurrency(performance.cpc, currency) : '—'} />
            <StatTile icon={TrendingUp} label="Cost per 1K Impressions" value={performance.cpm !== null ? formatCurrency(performance.cpm, currency) : '—'} />
          </div>

          {/* Trend + funnel */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <SpendTrendChart data={daily} loading={dailyLoading} currency={currency} />
            </div>
            <div className="lg:col-span-2">
              <AdFunnel
                impressions={performance.totalImpressions}
                clicks={performance.totalClicks}
                conversations={performance.totalConversations}
                qualifiedLeads={performance.totalQualifiedLeads}
                wonDeals={performance.totalWonDeals}
                loading={performanceLoading}
              />
            </div>
          </div>

          {/* Campaign table */}
          <section className="card-elevated overflow-hidden">
            <header className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Campaigns</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Every campaign with spend in this range, highest spend first</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3 text-right">Spend</th>
                    <th className="px-4 py-3 text-right">Impressions</th>
                    <th className="px-4 py-3 text-right">Clicks</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">CPC</th>
                    <th className="px-4 py-3 text-right">Conversations</th>
                    <th className="px-4 py-3 text-right">Qualified Leads</th>
                    <th className="px-4 py-3 text-right">Cost/Lead</th>
                    <th className="px-4 py-3 text-right">Won Value</th>
                    <th className="px-4 py-3 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {performance.campaigns.map((c) => {
                    const cpc = c.clicks > 0 ? c.spend / c.clicks : null
                    return (
                      <tr key={c.campaignId}>
                        <td className="max-w-[220px] truncate px-4 py-3 font-medium text-foreground">{c.campaignName}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.spend, c.currency)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.impressions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.ctr !== null ? `${(c.ctr * 100).toFixed(2)}%` : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{cpc !== null ? formatCurrency(cpc, c.currency) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.adConversations}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{c.qualifiedLeads}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.costPerQualifiedLead !== null ? formatCurrency(c.costPerQualifiedLead, c.currency) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(c.wonValue, c.currency)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.roas !== null ? `${c.roas.toFixed(2)}x` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-base font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  )
}
