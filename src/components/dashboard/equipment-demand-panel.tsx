"use client"

import { Wrench } from 'lucide-react'
import type { DemandSlice } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface EquipmentDemandPanelProps {
  data: DemandSlice[] | null
  loading: boolean
}

export function EquipmentDemandPanel({ data, loading }: EquipmentDemandPanelProps) {
  const max = data && data.length > 0 ? Math.max(...data.map((d) => d.count)) : 1

  return (
    <section className="flex h-full flex-col card-elevated">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Equipment Demand</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Most requested this month</p>
      </header>

      <div className="flex flex-1 flex-col p-5">
        {loading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : data.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No equipment requests yet"
            hint="Once inquiries capture an equipment type, demand shows up here."
          />
        ) : (
          <ul className="space-y-3">
            {data.map((d) => (
              <li key={d.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {d.count} {d.count === 1 ? 'request' : 'requests'}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(6, (d.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
