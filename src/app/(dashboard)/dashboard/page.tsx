"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'

import {
  loadActiveConversationContacts,
  loadActiveSites,
  loadActivity,
  loadConversationsSeries,
  loadEquipmentDemand,
  loadMetrics,
  loadOpenDealContacts,
  loadPipelineDonut,
  loadRecentContacts,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  DemandSlice,
  MetricsBundle,
  PipelineDonutData,
  RecentContact,
  ResponseTimeSummary,
  SiteSlice,
} from '@/lib/dashboard/types'

import { CLIENT_NAME, CLIENT_INDUSTRY, hasFeature } from '@/lib/features'
import { HeroStatsRow } from '@/components/dashboard/hero-stats-row'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RevenueForecast } from '@/components/dashboard/revenue-forecast'
import { EquipmentDemandPanel } from '@/components/dashboard/equipment-demand-panel'
import { ActiveSitesPanel } from '@/components/dashboard/active-sites-panel'

const RENTAL_INDUSTRY = (() => {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase()
  return ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')
})()

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const { defaultCurrency, profile } = useAuth()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [range, setRange] = useState<RangeDays>(30)
  // Keep a cache per range so switching tabs doesn't re-fetch what we
  // already have. Ranges the user hasn't opened yet stay null and
  // trigger a fetch on first view.
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([])
  const [activeConvContacts, setActiveConvContacts] = useState<RecentContact[]>([])
  const [openDealContacts, setOpenDealContacts] = useState<RecentContact[]>([])

  const [equipmentDemand, setEquipmentDemand] = useState<DemandSlice[] | null>(null)
  const [equipmentDemandLoading, setEquipmentDemandLoading] = useState(RENTAL_INDUSTRY)

  const [activeSites, setActiveSites] = useState<SiteSlice[] | null>(null)
  const [activeSitesLoading, setActiveSitesLoading] = useState(RENTAL_INDUSTRY)


  const loadAll = useCallback(() => {
    const db = createClient()

    // Kick everything off in parallel. Each block has its own
    // setState + finally so a slow query doesn't hold up faster
    // sections — each widget shows its own skeleton independently.
    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    if (hasFeature('pipelines')) {
      void loadPipelineDonut(db)
        .then((p) => setPipeline(p))
        .catch((err) => console.error('[dashboard] pipeline failed:', err))
        .finally(() => setPipelineLoading(false))
    } else {
      setPipelineLoading(false)
    }

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    // Fetch up to 50 so the biggest page-size option in the feed
    // (50 rows) is already in memory — switching sizes then becomes
    // a pure client-side slice with no extra round trip.
    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))

    void loadRecentContacts(db, 4)
      .then((c) => setRecentContacts(c))
      .catch((err) => console.error('[dashboard] recent contacts failed:', err))

    void loadActiveConversationContacts(db, 4)
      .then((c) => setActiveConvContacts(c))
      .catch((err) => console.error('[dashboard] active conversation contacts failed:', err))

    void loadOpenDealContacts(db, 4)
      .then((c) => setOpenDealContacts(c))
      .catch((err) => console.error('[dashboard] open deal contacts failed:', err))

    if (RENTAL_INDUSTRY && hasFeature('leads')) {
      void loadEquipmentDemand(db)
        .then((d) => setEquipmentDemand(d))
        .catch((err) => console.error('[dashboard] equipment demand failed:', err))
        .finally(() => setEquipmentDemandLoading(false))

      void loadActiveSites(db)
        .then((s) => setActiveSites(s))
        .catch((err) => console.error('[dashboard] active sites failed:', err))
        .finally(() => setActiveSitesLoading(false))
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])


  // Range switch handler — kept in an event callback (not an effect)
  // so the setState calls stay out of the react-hooks/set-state-in-effect
  // rule's way. The cached bucket check means switching back to a
  // previously-viewed range is instant and doesn't re-fetch.
  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  const heroLabel = CLIENT_NAME || 'the scale agency™'

  const labels = (() => {
    const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase()
    if (ind.includes('restaurant') || ind.includes('food') || ind.includes('pulao') || ind.includes('sultan')) return {
      heroHeadline:         'Order Operations',
      heroTagline:          'Orders, reservations & guest WhatsApp — live.',
      activeConversations:  'Active Order Chats',
      newContacts:          'New Customers · 7 Days',
      newLeads:             'New Leads · 7 Days',
      openDeals:            'Active Orders Value',
      dealWord:             'order',
      messagesSent:         'Replies Sent · 7 Days',
      chartTitle:           'Order Inquiries Over Time',
      chartSubtitle:        'Daily order & enquiry volume',
      pipelineTitle:        'Order Pipeline',
      pipelineSubtitle:     'Active orders by stage',
    }
    if (ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')) return {
      heroHeadline:         'Rental Operations',
      heroTagline:          'Rental inquiries, lead pipeline & client WhatsApp — live.',
      activeConversations:  'Active Inquiries',
      newContacts:          'New Customers · 7 Days',
      newLeads:             'Leads Captured · 7 Days',
      openDeals:            'Open Rental Quotes',
      dealWord:             'quote',
      messagesSent:         'Responses Sent · 7 Days',
      chartTitle:           'Rental Inquiries Over Time',
      chartSubtitle:        'Daily inquiry & response volume',
      pipelineTitle:        'Quote Pipeline',
      pipelineSubtitle:     'Active quotes by stage',
    }
    return {
      heroHeadline:         'Operations Dashboard',
      heroTagline:          'Your WhatsApp pipeline — live and ready.',
      activeConversations:  'Active Conversations',
      newContacts:          'New Contacts · 7 Days',
      newLeads:             'New Leads · 7 Days',
      openDeals:            'Open Deals Value',
      dealWord:             'deal',
      messagesSent:         'Messages Sent · 7 Days',
      chartTitle:           'Conversations Over Time',
      chartSubtitle:        'Daily message volume by direction',
      pipelineTitle:        'Pipeline Value',
      pipelineSubtitle:     'Open deals by stage',
    }
  })()

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || null
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="space-y-5">
      {/* Branded hero */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.06] px-6 py-7 sm:px-8">
        {/* Glow orbs */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary opacity-[0.10] blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-12 left-1/4 h-40 w-64 rounded-full bg-primary opacity-[0.06] blur-[70px]" />
        {/* Pattern overlay — rental deployments get a heavy-vehicle livery
            treatment (diagonal hazard chevrons + a crane silhouette
            watermark) instead of the generic SaaS grid, so the hero reads
            "fleet operations", not "template". */}
        {RENTAL_INDUSTRY ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.05]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, var(--primary) 0 14px, transparent 14px 42px)',
                maskImage:
                  'radial-gradient(ellipse 70% 130% at 100% 0%, black 0%, transparent 65%)',
              }}
            />
            {/* Chevron livery strip along the bottom edge */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 opacity-40"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, var(--primary) 0 10px, transparent 10px 20px)',
              }}
            />
            {/* Crane silhouette watermark */}
            <svg
              aria-hidden
              viewBox="0 0 120 100"
              className="pointer-events-none absolute -bottom-2 right-6 hidden h-28 w-auto text-primary opacity-[0.07] sm:block"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 96V20h72" />
              <path d="M36 20L20 40M52 20L32 44M68 20L48 44M84 20v18" />
              <path d="M84 38a7 7 0 1 0 0 .1" />
              <path d="M8 96h48" />
              <path d="M14 20h12" />
            </svg>
          </>
        ) : (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              maskImage: 'radial-gradient(ellipse 80% 100% at 70% 0%, black 30%, transparent 100%)',
            }}
          />
        )}
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-[0.2em] hero-accent-solid opacity-80">
              <span>{heroLabel} · {dateLine}</span>
              <span aria-hidden className="hidden h-3 w-px bg-primary/30 sm:inline-block" />
              <span className="hero-accent-gradient">
                Built by The Scale Agency
              </span>
            </p>
            <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              {greeting}
              {firstName ? (
                <>
                  ,{' '}
                  <span className="hero-accent-gradient">
                    {firstName}
                  </span>
                </>
              ) : null}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {labels.heroTagline}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-semibold hero-accent-solid">
              {labels.heroHeadline} · Live
            </span>
          </div>
        </div>
      </div>

      {/* Hero stat row — floating light panel (3 real metrics) + dark
          messaging callout. See components/dashboard/hero-stats-row. */}
      <HeroStatsRow
        metrics={metrics}
        loading={metricsLoading}
        currency={defaultCurrency}
        recentContacts={recentContacts}
        activeConvContacts={activeConvContacts}
        openDealContacts={openDealContacts}
        hasPipelines={hasFeature('pipelines')}
        labels={{
          activeConversations: labels.activeConversations,
          newContacts: labels.newContacts,
          openDeals: labels.openDeals,
          dealWord: labels.dealWord,
          newLeads: labels.newLeads,
        }}
      />

      {/* Quick actions */}
      <QuickActions />

      {/* Charts row */}
      {/* items-stretch (the grid default) stretches the two columns to
          match the tallest sibling; adding h-full on each wrapper and
          on the inner panels makes both cards actually fill that
          stretched height so their rounded borders line up. Without
          this, the pipeline card rendered at its natural (shorter)
          height while the line chart drove the row height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className={hasFeature('pipelines') ? 'h-full lg:col-span-3' : 'h-full lg:col-span-5'}>
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
            title={labels.chartTitle}
            subtitle={labels.chartSubtitle}
          />
        </div>
        {hasFeature('pipelines') && (
          <div className="h-full lg:col-span-2">
            <PipelineDonut
              data={pipeline}
              loading={pipelineLoading}
              currency={defaultCurrency}
              title={labels.pipelineTitle}
              subtitle={labels.pipelineSubtitle}
              dealWord={labels.dealWord}
            />
          </div>
        )}
      </div>

      {/* Rental-specific demand + site panels */}
      {RENTAL_INDUSTRY && hasFeature('leads') && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EquipmentDemandPanel data={equipmentDemand} loading={equipmentDemandLoading} />
          <ActiveSitesPanel data={activeSites} loading={activeSitesLoading} />
        </div>
      )}

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Revenue forecast — deal-based, meaningless without pipelines */}
      {hasFeature('pipelines') && <RevenueForecast currency={defaultCurrency} />}

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}
