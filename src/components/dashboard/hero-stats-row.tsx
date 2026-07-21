import Link from 'next/link'
import { ArrowDown, ArrowUp, Minus, MessageCircle, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'
import type { MetricsBundle } from '@/lib/dashboard/types'

interface HeroStatsRowProps {
  metrics: MetricsBundle | null
  loading: boolean
  currency: string
  hasPipelines: boolean
  labels: {
    activeConversations: string
    newContacts: string
    openDeals: string
    dealWord: string
    newLeads: string
  }
}

// The signature "floating light panel on a dark canvas" stat row — three
// real metrics side-by-side on an always-light paper surface, next to a
// dark callout tile for the week's messaging activity. Every number here
// is a real MetricsBundle field; nothing decorative is fabricated.
export function HeroStatsRow({ metrics, loading, currency, hasPipelines, labels }: HeroStatsRowProps) {
  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-[132px] animate-pulse rounded-3xl bg-muted lg:col-span-3" />
        <div className="h-[132px] animate-pulse rounded-3xl bg-muted lg:col-span-2" />
      </div>
    )
  }

  const thirdCell = hasPipelines
    ? {
        label: labels.openDeals,
        value: formatCurrency(metrics.openDealsValue, currency),
        subtitle: `${metrics.openDealsCount} open ${labels.dealWord}${metrics.openDealsCount === 1 ? '' : 's'}`,
      }
    : metrics.newLeads7d != null && metrics.newLeadsToday
      ? {
          label: labels.newLeads,
          value: metrics.newLeads7d.toLocaleString(),
          delta: metrics.newLeadsToday.current,
        }
      : null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Left: floating light panel, 3 stat cells */}
      <div className="panel-float flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0 lg:col-span-3">
        <StatCell
          label={labels.activeConversations}
          value={metrics.activeConversations.current.toLocaleString()}
          delta={metrics.activeConversations.previous}
          deltaLabel="vs yesterday"
        />
        <StatCell
          label={labels.newContacts}
          value={metrics.newContacts7d.toLocaleString()}
          delta={metrics.newContactsToday.current}
          deltaLabel="today"
          deltaIsCount
        />
        {thirdCell && (
          <StatCell
            label={thirdCell.label}
            value={thirdCell.value}
            subtitle={'subtitle' in thirdCell ? thirdCell.subtitle : undefined}
            delta={'delta' in thirdCell ? thirdCell.delta : undefined}
            deltaLabel="today"
            deltaIsCount
          />
        )}
      </div>

      {/* Right: dark callout — this week's messaging activity */}
      <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl bg-zinc-900 p-6 text-white shadow-elevated">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary opacity-[0.14] blur-[60px]" />
        <div className="relative flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Messages · 7 days
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Live
          </span>
        </div>

        <p className="relative mt-3 font-heading text-[34px] font-bold leading-none tabular-nums">
          {metrics.messagesSent7d.toLocaleString()}
        </p>

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            <MessageCircle className="h-3 w-3" />
            WhatsApp
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80">
            +{metrics.messagesSentToday.current.toLocaleString()} today
          </span>
          <Link
            href="/inbox"
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Open inbox
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCell({
  label,
  value,
  subtitle,
  delta,
  deltaLabel,
  deltaIsCount,
}: {
  label: string
  value: string
  subtitle?: string
  delta?: number
  deltaLabel?: string
  deltaIsCount?: boolean
}) {
  const Arrow = delta == null ? null : delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus
  const deltaColor =
    delta == null
      ? ''
      : delta > 0
        ? 'bg-emerald-500/15 text-emerald-700'
        : delta < 0
          ? 'bg-red-500/15 text-red-700'
          : 'bg-black/5 text-neutral-500'
  const deltaText =
    delta == null
      ? null
      : deltaIsCount
        ? delta === 0
          ? `None yet ${deltaLabel}`
          : `+${delta.toLocaleString()} ${deltaLabel}`
        : delta === 0
          ? `No change ${deltaLabel}`
          : `${delta > 0 ? '+' : ''}${delta.toLocaleString()} ${deltaLabel}`

  return (
    <div className="flex-1 px-5 py-4 sm:px-6 sm:py-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-heading text-[26px] font-bold leading-none tabular-nums text-foreground sm:text-[28px]">
        {value}
      </p>
      {deltaText ? (
        <div className="mt-2 flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', deltaColor)}>
            {Arrow ? <Arrow className="h-2.5 w-2.5" /> : null}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{deltaText}</span>
        </div>
      ) : subtitle ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  )
}
