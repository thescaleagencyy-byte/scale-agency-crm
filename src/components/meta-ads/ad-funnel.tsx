"use client"

import { Filter } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'

interface FunnelStage {
  label: string
  value: number
}

interface AdFunnelProps {
  impressions: number
  clicks: number
  conversations: number
  qualifiedLeads: number
  wonDeals: number
  loading: boolean
}

/**
 * Classic ad-performance funnel: Impressions -> Clicks -> Conversations
 * -> Qualified Leads -> Won Deals. Each stage's bar width is relative
 * to impressions (the true top of funnel), with the conversion rate
 * off the *previous* stage shown alongside — that's the number a
 * performance marketer actually watches for where the drop-off is.
 */
export function AdFunnel({ impressions, clicks, conversations, qualifiedLeads, wonDeals, loading }: AdFunnelProps) {
  const stages: FunnelStage[] = [
    { label: 'Impressions', value: impressions },
    { label: 'Clicks', value: clicks },
    { label: 'Conversations', value: conversations },
    { label: 'Qualified Leads', value: qualifiedLeads },
    { label: 'Won Deals', value: wonDeals },
  ]
  const maxValue = Math.max(1, impressions)

  return (
    <section className="flex h-full flex-col card-elevated">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Ad Funnel</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Where the drop-off happens, stage by stage</p>
      </header>
      <div className="flex-1 p-5">
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : impressions === 0 ? (
          <EmptyState icon={Filter} title="No funnel data yet" hint="Shows up once ad spend and synced impressions land." />
        ) : (
          <div className="space-y-3">
            {stages.map((stage, i) => {
              const widthPct = Math.max(2, (stage.value / maxValue) * 100)
              const prevValue = i > 0 ? stages[i - 1].value : null
              const conversionRate = prevValue && prevValue > 0 ? (stage.value / prevValue) * 100 : null
              return (
                <div key={stage.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{stage.label}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {conversionRate !== null && (
                        <span className="tabular-nums">{conversionRate.toFixed(1)}%</span>
                      )}
                      <span className="tabular-nums font-semibold text-foreground">{stage.value.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full rounded-md bg-primary/70 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
