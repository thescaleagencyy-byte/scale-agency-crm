'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Flame, MessageCircle, Phone } from 'lucide-react'
import type { WorkspaceLead } from '@/lib/dashboard/workspace-queries'
import { cn } from '@/lib/utils'
import { NotchCard, PersonAvatar, SectionHead, displayPhone, leadName } from './primitives'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot', icon: <Flame className="h-3.5 w-3.5 text-orange-500" strokeWidth={1.75} /> },
  { key: 'week', label: 'Quiet this week' },
  { key: 'overdue', label: 'Overdue' },
]

const DAY = 24 * 60 * 60 * 1000

function quietDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY))
}

export function FollowUps({
  leads,
  total,
  loading,
}: {
  leads: WorkspaceLead[]
  total: number
  loading: boolean
}) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      const d = quietDays(l.updatedAt)
      if (filter === 'hot' && l.quality !== 'hot') return false
      if (filter === 'week' && d > 7) return false
      if (filter === 'overdue' && d <= 7) return false
      if (!q) return true
      return [l.name, l.phone, l.service].some((v) => v?.toLowerCase().includes(q))
    })
  }, [leads, filter, search])

  return (
    <section aria-labelledby="ws-follow-ups" className="space-y-4">
      <SectionHead
        title="Follow-ups"
        count={total}
        countLabel="waiting"
        href="/leads"
        search={search}
        onSearch={setSearch}
        filters={FILTERS}
        active={filter}
        onFilter={setFilter}
      />

      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[200px] w-[300px] shrink-0 animate-pulse rounded-[26px] bg-card/70" />
          ))
        ) : shown.length === 0 ? (
          <div className="flex h-[200px] w-full items-center justify-center rounded-[26px] border border-dashed border-border text-sm text-muted-foreground">
            {leads.length === 0 ? 'Every new lead has been contacted' : 'Nothing in this filter'}
          </div>
        ) : (
          shown.map((l, i) => {
            const name = leadName(l.name, l.phone)
            const days = quietDays(l.updatedAt)
            const lead = i === 0
            const chat = l.conversationId ? `/inbox?c=${l.conversationId}` : '/inbox'
            return (
              <NotchCard
                key={l.id}
                href="/leads"
                label={`Open ${name} in leads`}
                className={cn(
                  'flex h-[200px] w-[300px] shrink-0 snap-start flex-col p-4',
                  lead && 'bg-primary text-primary-foreground',
                )}
              >
                <div className="flex items-center gap-3 pr-14">
                  <PersonAvatar name={name} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className={cn('truncate text-[11px]', lead ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                      {l.service ?? (l.name ? displayPhone(l.phone) : 'WhatsApp enquiry')}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                      lead ? 'bg-primary-foreground/10' : 'bg-muted',
                    )}
                  >
                    <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-heading text-lg leading-tight">Follow up on WhatsApp</p>
                    <p className={cn('text-xs tabular-nums', lead ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                      Quiet for {days} day{days === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border px-4 text-xs',
                      lead ? 'border-primary-foreground/15' : 'border-border',
                    )}
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', days > 7 ? 'bg-red-500' : 'bg-amber-500')} />
                    <span className="truncate">{days > 7 ? 'Overdue' : 'Not called yet'}</span>
                  </span>
                  <a
                    href={`tel:+${l.phone.replace(/\D/g, '')}`}
                    aria-label={`Call ${name}`}
                    title="Call"
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors',
                      lead
                        ? 'border-primary-foreground/15 hover:bg-primary-foreground/10'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    <Phone className="h-4 w-4" strokeWidth={1.5} />
                  </a>
                  <Link
                    href={chat}
                    aria-label={`Open chat with ${name}`}
                    title="Open chat"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white transition-colors hover:bg-zinc-800"
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                  </Link>
                </div>
              </NotchCard>
            )
          })
        )}
      </div>
    </section>
  )
}
