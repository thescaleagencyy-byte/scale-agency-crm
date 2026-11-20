'use client'

import Link from 'next/link'
import { Minus, Sparkles } from 'lucide-react'
import type { ActivityItem } from '@/lib/dashboard/types'
import { hasFeature } from '@/lib/features'
import { DailyDigestCard } from '@/components/dashboard/daily-digest-card'
import { CircleLink } from './primitives'

function stamp(iso: string) {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The dark column on the right: the morning briefing on top, then a
// timeline of what just happened. Stays in view while the left scrolls.
export function SummaryPanel({
  activity,
  loading,
  onHide,
}: {
  activity: ActivityItem[] | null
  loading: boolean
  onHide: () => void
}) {
  const items = (activity ?? []).slice(0, 7)
  return (
    <aside className="flex flex-col gap-3 rounded-[30px] bg-zinc-950 p-3 text-white xl:sticky xl:top-0 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto xl:[scrollbar-width:none]">
      <div className="flex shrink-0 items-center gap-3 p-1">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </span>
        <h2 className="flex-1 font-heading text-[22px] font-normal tracking-tight">Summary</h2>
        {hasFeature('copilot') && <CircleLink href="/copilot" label="Ask CEO Copilot" tone="dark" />}
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide summary"
          title="Hide summary"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:bg-white hover:text-black"
        >
          <Minus className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {hasFeature('daily_digest') && <DailyDigestCard embedded />}

      <div className="shrink-0 rounded-[22px] bg-white/[0.06] p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px]">Latest activity</p>
          <a href="#activity" className="text-xs text-white/50 transition-colors hover:text-white">
            See all
          </a>
        </div>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded-full bg-white/10" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-white/50">Nothing has happened yet today</p>
        ) : (
          <ol className="relative">
            {items.map((it, i) => {
              const body = (
                <>
                  <span className="w-12 shrink-0 pt-px text-[11px] tabular-nums text-white/45" suppressHydrationWarning>
                    {stamp(it.at)}
                  </span>
                  <span className="relative flex w-3 shrink-0 justify-center">
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${i === 0 ? 'bg-primary' : 'border border-white/30 bg-zinc-950'}`} />
                    {i < items.length - 1 && <span className="absolute bottom-[-18px] top-4 w-px bg-white/12" />}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-white/80">{it.text}</span>
                </>
              )
              return (
                <li key={it.id} className="pb-[18px] last:pb-0">
                  {it.href ? (
                    <Link href={it.href} className="flex gap-3 rounded-lg transition-colors hover:text-white">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3">{body}</div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </aside>
  )
}

/** Small black pill that brings the summary back once hidden. */
export function SummaryReopen({ onShow }: { onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      className="fixed bottom-6 right-6 z-30 flex h-12 items-center gap-2.5 rounded-full bg-zinc-950 py-1.5 pl-1.5 pr-5 text-sm text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] transition-colors hover:bg-zinc-800"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
      </span>
      Summary
    </button>
  )
}
