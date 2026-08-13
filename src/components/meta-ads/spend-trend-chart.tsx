"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import type { MetaAdsDailyPoint } from '@/lib/dashboard/types'
import { formatCurrency } from '@/lib/currency'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'

interface SpendTrendChartProps {
  data: MetaAdsDailyPoint[] | null
  loading: boolean
  currency: string
}

// Same hand-rolled SVG approach as dashboard/conversations-chart.tsx —
// no charting library in this codebase, viewBox-scaled bars.
const VB_W = 760
const VB_H = 220
const PADDING = { top: 16, right: 16, bottom: 28, left: 56 }

export function SpendTrendChart({ data, loading, currency }: SpendTrendChartProps) {
  const { maxY, niceTicks } = useMemo(() => {
    const max = (data ?? []).reduce((m, p) => Math.max(m, p.spend), 0)
    const ceil = niceCeil(max)
    const ticks = [0, ceil / 4, ceil / 2, (3 * ceil) / 4, ceil].map((v) => Math.round(v))
    return { maxY: ceil, niceTicks: Array.from(new Set(ticks)) }
  }, [data])

  return (
    <section className="flex h-full flex-col card-elevated">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Daily Spend</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Ad spend by day across all campaigns</p>
      </header>
      <div className="p-5">
        {loading || !data ? (
          <Skeleton className="h-[220px] w-full" />
        ) : data.every((p) => p.spend === 0) ? (
          <EmptyState
            icon={TrendingUp}
            title="No spend in this range"
            hint="Once the daily sync runs against real ad activity, spend will show up here."
          />
        ) : (
          <BarSvg data={data} maxY={maxY} ticks={niceTicks} currency={currency} />
        )}
      </div>
    </section>
  )
}

function BarSvg({
  data,
  maxY,
  ticks,
  currency,
}: {
  data: MetaAdsDailyPoint[]
  maxY: number
  ticks: number[]
  currency: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom
  const slotW = chartW / data.length
  const barW = Math.max(2, slotW * 0.6)

  const yFor = (v: number) => (maxY === 0 ? PADDING.top + chartH : PADDING.top + chartH - (v / maxY) * chartH)
  const xFor = (i: number) => PADDING.left + i * slotW + slotW / 2

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onMove = (e: MouseEvent) => {
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const local = pt.matrixTransform(ctm.inverse())
      if (local.x < PADDING.left || local.x > VB_W - PADDING.right) {
        setHoverIdx(null)
        return
      }
      const idx = Math.max(0, Math.min(data.length - 1, Math.floor((local.x - PADDING.left) / slotW)))
      setHoverIdx(idx)
    }
    const onLeave = () => setHoverIdx(null)
    svg.addEventListener('mousemove', onMove)
    svg.addEventListener('mouseleave', onLeave)
    return () => {
      svg.removeEventListener('mousemove', onMove)
      svg.removeEventListener('mouseleave', onLeave)
    }
  }, [data, slotW])

  const labelStride = Math.max(1, Math.ceil(data.length / 7))
  const hovered = hoverIdx !== null ? data[hoverIdx] : null

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-[220px] w-full" role="img" aria-label="Daily ad spend">
        {ticks.map((t) => {
          const y = yFor(t)
          return (
            <g key={t}>
              <line x1={PADDING.left} x2={VB_W - PADDING.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={PADDING.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
                {formatCurrency(t, currency)}
              </text>
            </g>
          )
        })}

        {data.map((p, i) =>
          i % labelStride === 0 ? (
            <text key={p.date} x={xFor(i)} y={VB_H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {shortDayLabel(p.date)}
            </text>
          ) : null,
        )}

        {data.map((p, i) => (
          <rect
            key={p.date}
            x={xFor(i) - barW / 2}
            y={yFor(p.spend)}
            width={barW}
            height={Math.max(0, yFor(0) - yFor(p.spend))}
            rx={2}
            fill={hoverIdx === i ? 'var(--primary)' : 'color-mix(in oklab, var(--primary) 55%, transparent)'}
          />
        ))}
      </svg>

      {hovered && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${(xFor(hoverIdx) / VB_W) * 100}%` }}
        >
          <div className="font-medium text-popover-foreground">{longDayLabel(hovered.date)}</div>
          <div className="mt-1 text-primary">{formatCurrency(hovered.spend, currency)}</div>
          <div className="text-muted-foreground">
            {hovered.impressions.toLocaleString()} impr · {hovered.clicks.toLocaleString()} clicks
          </div>
        </div>
      )}
    </div>
  )
}

function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function longDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function niceCeil(max: number): number {
  if (max <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}
