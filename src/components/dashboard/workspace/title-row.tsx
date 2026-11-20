'use client'

import Link from 'next/link'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import type { MetricsBundle } from '@/lib/dashboard/types'
import { hasFeature } from '@/lib/features'
import { cn } from '@/lib/utils'

function Chip({ value, good }: { value: string; good: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums',
        good ? 'bg-primary text-primary-foreground' : 'bg-red-500/15 text-red-600 dark:text-red-400',
      )}
    >
      {good ? <ArrowUp className="h-2.5 w-2.5" strokeWidth={2.5} /> : <ArrowDown className="h-2.5 w-2.5" strokeWidth={2.5} />}
      {value}
    </span>
  )
}

function BigStat({
  value,
  label,
  chip,
  loading,
}: {
  value: number
  label: string
  chip?: { value: string; good: boolean } | null
  loading: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      <span className="font-heading text-[40px] font-light leading-none tracking-tight tabular-nums text-foreground">
        {loading ? '–' : value.toLocaleString('en-GB')}
      </span>
      <span className="relative whitespace-nowrap pb-0.5 text-sm text-muted-foreground">
        {chip && !loading && <span className="absolute -top-6 left-0"><Chip {...chip} /></span>}
        {label}
      </span>
    </div>
  )
}

export function TitleRow({
  metrics,
  loading,
  title,
}: {
  metrics: MetricsBundle | null
  loading: boolean
  title: string
}) {
  const conv = metrics?.activeConversations
  const convDiff = conv && conv.previous > 0 ? conv.current - conv.previous : 0
  const leadsToday = metrics?.newLeadsToday?.current ?? 0
  const hasLeads = metrics?.newLeads7d !== null && metrics?.newLeads7d !== undefined

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-6">
      <div className="flex items-center gap-5">
        <h1 className="font-heading text-[36px] font-normal uppercase leading-none tracking-tight text-foreground sm:text-[44px]">
          {title}
        </h1>
        <Link
          href={hasFeature('inbox') ? '/inbox' : '/contacts'}
          className="flex h-12 items-center gap-3 rounded-full bg-zinc-950 py-1.5 pl-1.5 pr-5 text-sm text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 dark:border-zinc-950/20">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </span>
          {hasFeature('inbox') ? 'Open inbox' : 'Add contact'}
        </Link>
      </div>

      <div className="ml-auto flex flex-wrap items-end gap-x-8 gap-y-6 pt-4">
        <BigStat
          value={conv?.current ?? 0}
          label="open chats"
          loading={loading}
          chip={convDiff !== 0 ? { value: String(Math.abs(convDiff)), good: convDiff > 0 } : null}
        />
        {hasLeads && (
          <BigStat
            value={metrics?.newLeads7d ?? 0}
            label="new leads"
            loading={loading}
            chip={leadsToday > 0 ? { value: `${leadsToday} today`, good: true } : null}
          />
        )}
        {hasFeature('pipelines') && (
          <>
            <BigStat value={metrics?.openDealsCount ?? 0} label="deals" loading={loading} />
            <BigStat value={metrics?.dealsWonCount ?? 0} label="won" loading={loading} />
          </>
        )}
      </div>
    </div>
  )
}
