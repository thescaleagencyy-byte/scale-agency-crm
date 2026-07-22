"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, TrendingUp, MessageSquare, Workflow } from 'lucide-react'
import type { ComponentType } from 'react'
import { CLIENT_INDUSTRY, CLIENT_NAME, hasFeature, PATH_FEATURE_MAP } from '@/lib/features'

interface Action {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
}

// Candidate actions in preference order per industry. Feature-gated
// deployments (NEXT_PUBLIC_FEATURES) must not render actions whose target
// route the middleware would bounce back to /dashboard — those read as
// "buttons that don't work". Filter by the same PATH_FEATURE_MAP the
// middleware uses, then keep the top 4.
function getActions(): Action[] {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase()

  let candidates: Action[]
  if (ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')) {
    candidates = [
      { label: 'New Customer',   href: '/contacts',  icon: UserPlus,      tint: 'text-primary' },
      { label: 'New Quote',      href: '/pipelines', icon: Briefcase,     tint: 'text-blue-400' },
      { label: 'View Inquiries', href: '/leads',     icon: TrendingUp,    tint: 'text-amber-400' },
      { label: 'View WhatsApp',  href: '/inbox',     icon: MessageSquare, tint: 'text-primary' },
      { label: 'Automations',    href: '/n8n',       icon: Workflow,      tint: 'text-blue-400' },
    ]
  } else if (ind.includes('restaurant') || ind.includes('food') || ind.includes('pulao') || ind.includes('sultan')) {
    candidates = [
      { label: 'New Customer', href: '/contacts',  icon: UserPlus,      tint: 'text-primary' },
      { label: 'New Order',    href: '/pipelines', icon: Briefcase,     tint: 'text-blue-400' },
      { label: 'View Leads',   href: '/leads',     icon: TrendingUp,    tint: 'text-amber-400' },
      { label: 'View Orders',  href: '/inbox',     icon: MessageSquare, tint: 'text-primary' },
      { label: 'Automations',  href: '/n8n',       icon: Workflow,      tint: 'text-blue-400' },
    ]
  } else {
    candidates = [
      { label: 'New Contact', href: '/contacts',  icon: UserPlus,      tint: 'text-primary' },
      { label: 'New Deal',    href: '/pipelines', icon: Briefcase,     tint: 'text-blue-400' },
      { label: 'View Leads',  href: '/leads',     icon: TrendingUp,    tint: 'text-amber-400' },
      { label: 'View Inbox',  href: '/inbox',     icon: MessageSquare, tint: 'text-primary' },
      { label: 'Automations', href: '/n8n',       icon: Workflow,      tint: 'text-blue-400' },
    ]
  }

  return candidates
    .filter((a) => {
      const key = PATH_FEATURE_MAP[a.href]
      return !key || hasFeature(key)
    })
    .slice(0, 4)
}

export function QuickActions() {
  const ACTIONS = getActions()
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 card-elevated px-4 py-3.5 transition-all duration-150 hover:border-border/80 hover:bg-card-2 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 ${a.tint} transition-colors group-hover:bg-muted`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-foreground">{a.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
