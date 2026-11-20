"use client"

import Image from 'next/image'
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
import { loadMetaAdsCampaignPerformance } from '@/lib/meta-ads/rollup'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  DemandSlice,
  MetaAdsPerformance,
  MetricsBundle,
  PipelineDonutData,
  RecentContact,
  ResponseTimeSummary,
  SiteSlice,
} from '@/lib/dashboard/types'

import { CLIENT_NAME, CLIENT_INDUSTRY, hasFeature } from '@/lib/features'
import { HeroStatsRow } from '@/components/dashboard/hero-stats-row'
import { DailyDigestCard } from '@/components/dashboard/daily-digest-card'
import { AgentQueueCard } from '@/components/dashboard/agent-queue-card'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RevenueForecast } from '@/components/dashboard/revenue-forecast'
import { EquipmentDemandPanel } from '@/components/dashboard/equipment-demand-panel'
import { ActiveSitesPanel } from '@/components/dashboard/active-sites-panel'
import { MetaAdsPerformancePanel } from '@/components/dashboard/meta-ads-performance-panel'

const RENTAL_INDUSTRY = (() => {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase()
  return ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')
})()

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const { defaultCurrency } = useAuth()
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

  const [metaAds, setMetaAds] = useState<MetaAdsPerformance | null>(null)
  const [metaAdsLoading, setMetaAdsLoading] = useState(hasFeature('meta_ads'))


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

    if (hasFeature('meta_ads')) {
      void loadMetaAdsCampaignPerformance(db, 30)
        .then((m) => setMetaAds(m))
        .catch((err) => console.error('[dashboard] meta ads failed:', err))
        .finally(() => setMetaAdsLoading(false))
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

  const heroLabel = CLIENT_NAME || 'The Scale Agency'

  const labels = (() => {
    const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase()
    if (ind.includes('restaurant') || ind.includes('food') || ind.includes('pulao') || ind.includes('sultan')) return {
      heroHeadline:         'Order operations',
      heroTagline:          'Orders, reservations and guest chats on WhatsApp',
      activeConversations:  'Active order chats',
      newContacts:          'New customers · 7 days',
      newLeads:             'New leads · 7 days',
      openDeals:            'Active orders value',
      dealWord:             'order',
      messagesSent:         'Replies sent · 7 days',
      chartTitle:           'Order inquiries over time',
      chartSubtitle:        'Daily order & enquiry volume',
      pipelineTitle:        'Order pipeline',
      pipelineSubtitle:     'Active orders by stage',
    }
    if (ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')) return {
      heroHeadline:         'Rental operations',
      heroTagline:          'Rental inquiries, leads and client chats on WhatsApp',
      activeConversations:  'Active inquiries',
      newContacts:          'New customers · 7 days',
      newLeads:             'Leads captured · 7 days',
      openDeals:            'Open rental quotes',
      dealWord:             'quote',
      messagesSent:         'Responses sent · 7 days',
      chartTitle:           'Rental inquiries over time',
      chartSubtitle:        'Daily inquiry & response volume',
      pipelineTitle:        'Quote pipeline',
      pipelineSubtitle:     'Active quotes by stage',
    }
    return {
      heroHeadline:         'Operations dashboard',
      heroTagline:          'Conversations, leads and deals from your WhatsApp number',
      activeConversations:  'Active conversations',
      newContacts:          'New contacts · 7 days',
      newLeads:             'New leads · 7 days',
      openDeals:            'Open deals value',
      dealWord:             'deal',
      messagesSent:         'Messages sent · 7 days',
      chartTitle:           'Conversations over time',
      chartSubtitle:        'Daily message volume by direction',
      pipelineTitle:        'Pipeline value',
      pipelineSubtitle:     'Open deals by stage',
    }
  })()

  const dateLine = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const updatedAt = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-5">
      {/* Page header — names the day, quiet surface, one live dot as the
          only colour. No glows or washes: the stat row below carries the
          weight of the screen. */}
      <div className={`relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-6 sm:px-8 ${RENTAL_INDUSTRY ? 'sm:pb-20' : ''}`}>
        {RENTAL_INDUSTRY ? (
          <>
            {/* Real fleet photos of the equipment this account rents */}
            <Image
              src="/clients/ashwheelz-fleet/transporter.png"
              alt=""
              aria-hidden
              width={240}
              height={160}
              className="pointer-events-none absolute bottom-2 right-2 hidden h-16 w-auto object-contain sm:block"
            />
            <Image
              src="/clients/ashwheelz-fleet/forklift.png"
              alt=""
              aria-hidden
              width={200}
              height={160}
              className="pointer-events-none absolute bottom-2 right-32 hidden h-16 w-auto object-contain sm:block"
            />
          </>
        ) : null}
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">{heroLabel}</p>
            <h1 suppressHydrationWarning className="font-heading text-[28px] font-medium leading-tight tracking-tight text-foreground sm:text-[32px]">
              {dateLine}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {labels.heroTagline}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            <span className="text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
              Updated {updatedAt}
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

      {/* Daily briefing — proactive digest, see components/dashboard/daily-digest-card */}
      {hasFeature('daily_digest') && <DailyDigestCard />}

      {/* Autonomous Daily Agent v1 — draft-and-approve queue, see components/dashboard/agent-queue-card */}
      {hasFeature('agent_queue') && <AgentQueueCard />}

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

      {/* Meta Ads Analytics — spend joined against leads + won deals */}
      {hasFeature('meta_ads') && <MetaAdsPerformancePanel data={metaAds} loading={metaAdsLoading} />}

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Revenue forecast — deal-based, meaningless without pipelines */}
      {hasFeature('pipelines') && <RevenueForecast currency={defaultCurrency} />}

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}
