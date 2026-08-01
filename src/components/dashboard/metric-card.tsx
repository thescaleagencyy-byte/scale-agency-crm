import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'hero' | 'tint1' | 'tint2' | 'tint3'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
  /** Exactly one card per row should be 'hero' (dark focal tile). Others cycle tint1-3. */
  variant?: CardVariant
  /** Recent daily values, oldest first. Renders as a trailing bar sparkline. Omit if no real history exists. */
  sparkline?: number[]
  /** Stagger delay in ms for the entrance animation (e.g. index * 60). */
  animationDelayMs?: number
}

const TINT_CLASS: Record<Exclude<CardVariant, 'hero'>, string> = {
  tint1: 'kpi-tint-1',
  tint2: 'kpi-tint-2',
  tint3: 'kpi-tint-3',
}

const CHIP_CLASS: Record<Exclude<CardVariant, 'hero'>, string> = {
  tint1: 'kpi-chip-1',
  tint2: 'kpi-chip-2',
  tint3: 'kpi-chip-3',
}

/**
 * Standalone KPI tile — used by Quotes/Voice (single-row, no messaging
 * callout). The dashboard's own hero row moved to hero-stats-row.tsx,
 * which is tied to MetricsBundle; this stays generic for pages that
 * just need "icon + title + value (+ delta or subtitle)".
 */
export function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  subtitle,
  variant = 'tint1',
  sparkline,
  animationDelayMs = 0,
}: MetricCardProps) {
  const isHero = variant === 'hero'

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl p-5 transition-all duration-200',
        'animate-in fade-in slide-in-from-bottom-2 animation-duration-500 fill-mode-forwards',
        'hover:-translate-y-0.5',
        isHero
          ? 'bg-zinc-900 text-white ring-1 ring-white/10 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30'
          : cn(
              'bg-card text-card-foreground ring-1 ring-border/70 shadow-sm hover:shadow-md hover:shadow-black/10',
              TINT_CLASS[variant]
            )
      )}
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="relative flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
            isHero ? 'bg-white/10 text-white' : cn('bg-primary/10 text-primary', CHIP_CLASS[variant])
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <p
          className={cn(
            'min-w-0 text-[11px] font-semibold uppercase leading-snug tracking-wide',
            isHero ? 'text-white/60' : 'text-muted-foreground'
          )}
        >
          {title}
        </p>
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-3">
        <p className="min-w-0 font-heading text-[32px] font-bold leading-none tracking-tight tabular-nums">
          {value}
        </p>
        {sparkline && sparkline.length > 0 ? <Sparkline values={sparkline} hero={isHero} /> : null}
      </div>

      {delta ? (
        <DeltaPill sign={delta.sign} label={delta.label} hero={isHero} />
      ) : subtitle ? (
        <p className={cn('relative mt-2 text-xs', isHero ? 'text-white/60' : 'text-muted-foreground')}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

function Sparkline({ values, hero }: { values: number[]; hero: boolean }) {
  const max = Math.max(...values, 1)
  const barOpacity = hero ? 'bg-primary/35' : 'bg-primary/25'
  return (
    <div aria-hidden="true" className="flex h-9 shrink-0 items-end gap-[2px]">
      {values.map((v, i) => {
        const isLast = i === values.length - 1
        const height = Math.max(2, Math.round((v / max) * 36))
        return (
          <span
            key={i}
            className={cn('w-[4px] rounded-full transition-colors', isLast ? 'bg-primary' : barOpacity)}
            style={{ height: `${isLast ? Math.max(height, 6) : height}px` }}
          />
        )
      })}
    </div>
  )
}

function DeltaPill({ sign, label, hero }: { sign: number; label: string; hero: boolean }) {
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  const pillClass =
    sign > 0
      ? 'bg-emerald-500/15 text-emerald-500'
      : sign < 0
      ? 'bg-red-500/15 text-red-500'
      : 'bg-muted text-muted-foreground'
  return (
    <div className="relative mt-2 flex items-center gap-1.5 text-sm">
      <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums', pillClass)}>
        <Arrow className="h-3 w-3" aria-hidden />
      </span>
      <span className={cn('truncate text-xs', hero ? 'text-white/60' : 'text-muted-foreground')}>{label}</span>
    </div>
  )
}
