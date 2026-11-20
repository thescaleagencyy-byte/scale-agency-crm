'use client'

import { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import type { WorkspaceLead } from '@/lib/dashboard/workspace-queries'
import { NotchCard, PersonAvatar, SectionHead, ago, displayPhone, leadName } from './primitives'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot', icon: <Flame className="h-3.5 w-3.5 text-orange-500" strokeWidth={1.75} /> },
  { key: 'warm', label: 'Warm' },
  { key: 'cold', label: 'Cold' },
  { key: 'unscored', label: 'Not scored' },
]

// Score 0–100 → five dots, cool to warm. Unfilled dots stay grey so a
// low score still reads as a scale, not as "missing".
const DOT_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#a3e635', '#22c55e']

function InterestDots({ score }: { score: number }) {
  const filled = Math.max(0, Math.min(5, Math.ceil(score / 20)))
  return (
    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1.5" aria-label={`Score ${score} of 100`}>
      {DOT_COLORS.map((c, i) => (
        <span
          key={c}
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: i < filled ? c : 'color-mix(in oklch, var(--muted-foreground) 25%, transparent)' }}
        />
      ))}
    </span>
  )
}

const QUALITY_LABEL = { hot: 'Hot lead', warm: 'Warm lead', cold: 'Cold lead' } as const

function sourceLabel(source: string | null): string {
  if (!source || source.toLowerCase().includes('whatsapp')) return 'WhatsApp'
  const s = source.toLowerCase()
  if (s.includes('ctwa') || s.includes('ad')) return 'Meta ad'
  if (s.includes('insta')) return 'Instagram'
  if (s.includes('voice') || s.includes('call')) return 'Phone call'
  if (s.includes('web') || s.includes('form')) return 'Website'
  return source.charAt(0).toUpperCase() + source.slice(1)
}

export function NewLeads({
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
      if (filter === 'unscored' ? l.quality !== null : filter !== 'all' && l.quality !== filter) return false
      if (!q) return true
      return [l.name, l.phone, l.service, l.summary].some((v) => v?.toLowerCase().includes(q))
    })
  }, [leads, filter, search])

  return (
    <section aria-labelledby="ws-new-leads" className="space-y-4">
      <SectionHead
        title="New leads"
        count={total}
        countLabel={total === 1 ? 'lead' : 'leads'}
        href="/leads"
        search={search}
        onSearch={setSearch}
        filters={FILTERS}
        active={filter}
        onFilter={setFilter}
      />

      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[196px] w-[296px] shrink-0 animate-pulse rounded-[26px] bg-card/70" />
          ))
        ) : shown.length === 0 ? (
          <div className="flex h-[196px] w-full items-center justify-center rounded-[26px] border border-dashed border-border text-sm text-muted-foreground">
            {leads.length === 0 ? 'Leads from WhatsApp chats show up here' : 'No leads match this filter'}
          </div>
        ) : (
          shown.map((l) => {
            const name = leadName(l.name, l.phone)
            return (
              <NotchCard
                key={l.id}
                href={l.conversationId ? `/inbox?c=${l.conversationId}` : '/leads'}
                label={`Open chat with ${name}`}
                className="flex h-[196px] w-[296px] shrink-0 snap-start flex-col p-5"
              >
                <PersonAvatar name={name} size={44} />
                <p className="mt-4 truncate pr-2 font-heading text-lg leading-tight text-foreground">{name}</p>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {l.service ?? l.summary ?? (l.name ? displayPhone(l.phone) : 'WhatsApp enquiry')}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">Source</p>
                    <div className="flex gap-1">
                      <span className="truncate rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground/80">
                        {sourceLabel(l.source)}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground/80">
                        {ago(l.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mb-1.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                      {l.quality === 'hot' && <Flame className="h-3 w-3 text-orange-500" strokeWidth={1.75} />}
                      {l.quality ? QUALITY_LABEL[l.quality] : `Score ${l.score}`}
                    </p>
                    <InterestDots score={l.score} />
                  </div>
                </div>
              </NotchCard>
            )
          })
        )}
      </div>
    </section>
  )
}
