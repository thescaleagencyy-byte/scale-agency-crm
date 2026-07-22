"use client"

import { MapPin } from 'lucide-react'
import type { SiteSlice } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface ActiveSitesPanelProps {
  data: SiteSlice[] | null
  loading: boolean
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function ActiveSitesPanel({ data, loading }: ActiveSitesPanelProps) {
  return (
    <section className="flex h-full flex-col card-elevated">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Active Project Sites</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Where inquiries are coming from</p>
      </header>

      <div className="flex flex-1 flex-col p-5">
        {loading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : data.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No project sites yet"
            hint="Once inquiries capture a site name, active sites show up here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((s) => (
              <li key={s.label} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.label}</span>
                <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                  {s.count} {s.count === 1 ? 'inquiry' : 'inquiries'}
                </span>
                <span className="flex-shrink-0 text-xs text-muted-foreground/70 tabular-nums">
                  {relativeTime(s.lastActivity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
