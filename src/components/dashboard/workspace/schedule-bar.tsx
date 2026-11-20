'use client'

import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loadTodaySchedule, type ScheduleItem } from '@/lib/dashboard/workspace-queries'
import { CircleLink, PersonAvatar, displayPhone } from './primitives'

// Today's booked calls on one black rail. The lime track runs across the
// working day; each booking sits at its start time and a thin marker
// shows where "now" is.
const DAY_START = 9
const DAY_END = 21

function hm(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function pos(d: Date, start: number, end: number) {
  const h = d.getHours() + d.getMinutes() / 60
  return Math.max(0, Math.min(100, ((h - start) / (end - start)) * 100))
}

export function ScheduleBar() {
  const [items, setItems] = useState<ScheduleItem[] | null>(null)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    loadTodaySchedule(createClient())
      .then(setItems)
      .catch((err) => {
        console.error('[schedule] failed:', err)
        setItems([])
      })
    const tick = () => setNow(new Date())
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])

  // Stretch the window if a booking falls outside normal hours.
  const hours = (items ?? []).map((s) => new Date(s.startAt).getHours())
  const start = Math.min(DAY_START, ...hours)
  const end = Math.max(DAY_END, ...hours.map((h) => h + 1))
  const ticks = [start + 3, start + 6, start + 9].filter((h) => h < end)
  const nowPos = now ? pos(now, start, end) : null
  const nowInDay = now ? now.getHours() >= start && now.getHours() < end : false

  return (
    <div className="flex h-16 min-w-0 flex-1 items-center gap-2 rounded-full bg-zinc-950 p-2 text-white">
      <span className="hidden shrink-0 pl-4 pr-1 text-[15px] xl:inline">Your schedule</span>
      <span className="hidden h-12 shrink-0 items-center gap-2 rounded-full border border-white/15 px-4 text-xs text-white/80 sm:flex">
        <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
        <span suppressHydrationWarning>
          {now ? now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''}
        </span>
      </span>

      <div className="relative h-12 min-w-0 flex-1 overflow-hidden rounded-full bg-primary text-primary-foreground">
        {/* Elapsed part of the day sits one step darker */}
        {nowPos !== null && nowInDay && (
          <div className="absolute inset-y-0 left-0 bg-black/[0.07]" style={{ width: `${nowPos}%` }} aria-hidden />
        )}

        {ticks.map((h) => (
          <span
            key={h}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] tabular-nums text-primary-foreground/45"
            style={{ left: `${((h - start) / (end - start)) * 100}%` }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}

        {items === null ? null : items.length === 0 ? (
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm">No calls booked today</span>
        ) : (
          items.map((s) => {
            const at = new Date(s.startAt)
            const past = now ? new Date(s.endAt) < now : false
            const names = s.people.map((p) => p.name || (p.phone ? displayPhone(p.phone) : 'Guest'))
            return (
              <div
                key={s.id}
                className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-xs text-zinc-950 shadow-sm"
                style={{ left: `calc(${pos(at, start, end)}% + 4px)`, opacity: past ? 0.6 : 1 }}
                title={`${hm(at)} · ${s.service ?? 'Booking'} · ${names.join(', ')}`}
              >
                <span className="flex -space-x-2">
                  {names.slice(0, 2).map((n, i) => (
                    <PersonAvatar key={i} name={n} size={28} ring />
                  ))}
                </span>
                <span className="tabular-nums">{hm(at)}</span>
              </div>
            )
          })
        )}

        {nowPos !== null && nowInDay && (
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${nowPos}%` }} aria-hidden>
            <span className="absolute inset-y-1.5 left-0 w-px bg-zinc-950" />
            <span
              className="absolute left-0 top-0.5 -translate-x-1/2 rounded-full bg-zinc-950 px-1.5 py-px text-[11px] tabular-nums text-white"
              suppressHydrationWarning
            >
              {now ? hm(now) : ''}
            </span>
          </div>
        )}
      </div>

      <CircleLink href="/appointments" label="Open appointments" tone="dark" className="h-12 w-12" />
    </div>
  )
}
