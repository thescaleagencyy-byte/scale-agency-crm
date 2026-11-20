'use client'

import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'
import { avatarColorForName } from '@/lib/contact-avatar'
import { cn } from '@/lib/utils'

/* A card with a rounded bite taken out of its top-right corner. The bite
   is painted in the page colour, with two concave fillets so the card's
   edge flows into it, and holds a round arrow button. */
export function NotchCard({
  href,
  label,
  className,
  children,
}: {
  href: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('relative rounded-[26px] bg-card', className)}>
      <div className="absolute right-0 top-0 h-[60px] w-[60px] rounded-bl-[24px] bg-background" aria-hidden>
        <span className="notch-fillet absolute -left-5 top-0" />
        <span className="notch-fillet absolute right-0 top-full" />
      </div>
      <CircleLink href={href} label={label} className="absolute right-1 top-1" />
      {children}
    </div>
  )
}

export function CircleLink({
  href,
  label,
  className,
  tone = 'light',
}: {
  href: string
  label: string
  className?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors',
        tone === 'light'
          ? 'border-border bg-card text-foreground hover:bg-foreground hover:text-background'
          : 'border-white/15 bg-transparent text-white hover:bg-white hover:text-black',
        className,
      )}
    >
      <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={1.5} />
    </Link>
  )
}

export function PersonAvatar({ name, size = 44, ring }: { name: string; size?: number; ring?: boolean }) {
  const { background, color } = avatarColorForName(name)
  const letter = name.match(/\p{L}/u)?.[0]?.toUpperCase() ?? '#'
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        ring && 'ring-2 ring-card',
      )}
      style={{ width: size, height: size, background, color, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {letter}
    </span>
  )
}

export function SectionHead({
  title,
  count,
  countLabel,
  href,
  search,
  onSearch,
  filters,
  active,
  onFilter,
}: {
  title: string
  count: number
  countLabel: string
  href: string
  search: string
  onSearch: (v: string) => void
  filters: { key: string; label: string; icon?: React.ReactNode }[]
  active: string
  onFilter: (k: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-baseline gap-4">
        <h2 className="font-heading text-[22px] font-normal tracking-tight text-foreground">{title}</h2>
        <Link
          href={href}
          className="text-sm text-foreground underline decoration-foreground/40 underline-offset-[6px] transition-colors hover:decoration-foreground"
        >
          <span className="font-medium tabular-nums">{count}</span>{' '}
          <span className="text-muted-foreground">{countLabel}</span>
        </Link>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <label className="group flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-transparent px-3.5 text-sm text-muted-foreground focus-within:border-foreground/30 focus-within:bg-card">
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${title.toLowerCase()}`}
            className="w-16 bg-transparent text-foreground outline-none placeholder:text-muted-foreground focus:w-36 [transition:width_200ms]"
          />
        </label>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onFilter(f.key)}
            aria-pressed={active === f.key}
            className={cn(
              'flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors',
              active === f.key
                ? 'border-transparent bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
            )}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** "3 days ago" style relative time. */
export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

export function displayPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('92') && d.length === 12) return `+92 ${d.slice(2, 5)} ${d.slice(5, 9)} ${d.slice(9)}`
  return d.length > 6 ? `+${d}` : phone
}

export function leadName(name: string | null, phone: string): string {
  return name && /\p{L}/u.test(name) ? name : displayPhone(phone)
}
