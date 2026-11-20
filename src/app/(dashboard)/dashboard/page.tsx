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
import { TitleRow } from '@/components/dashboard/workspace/title-row'
import { NewLeads } from '@/components/dashboard/workspace/new-leads'
import { FollowUps } from '@/components/dashboard/workspace/follow-ups'
import { SummaryPanel, SummaryReopen } from '@/components/dashboard/workspace/summary-panel'
import { loadFollowUps, loadNewLeads, type WorkspaceLead } from '@/lib/dashboard/workspace-queries'
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

  const [newLeads, setNewLeads] = useState<{ leads: WorkspaceLead[]; total: number }>({ leads: [], total: 0 })
  const [newLeadsLoading, setNewLeadsLoading] = useState(hasFeature('leads'))
  const [followUps, setFollowUps] = useState<{ leads: WorkspaceLead[]; total: number }>({ leads: [], total: 0 })
  const [followUpsLoading, setFollowUpsLoading] = useState(hasFeature('leads'))


  // Summary column: open by default on wide screens, hidden on laptops
  // where it would squeeze the cards. The user's choice is remembered.
  const [summaryOpen, setSummaryOpen] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('ws-summary-open')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after mount
    setSummaryOpen(saved === null ? window.innerWidth >= 1600 : saved === '1')
  }, [])
  const toggleSummary = useCallback((open: boolean) => {
    setSummaryOpen(open)
    localStorage.setItem('ws-summary-open', open ? '1' : '0')
  }, [])

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

    if (hasFeature('leads')) {
      void loadNewLeads(db, 24)
        .then(setNewLeads)
        .catch((err) => console.error('[dashboard] new leads failed:', err))
        .finally(() => setNewLeadsLoading(false))

      void loadFollowUps(db, 12)
        .then(setFollowUps)
        .catch((err) => console.error('[dashboard] follow-ups failed:', err))
        .finally(() => setFollowUpsLoading(false))
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


  return (
    <div className="space-y-8">
      {/* Big page title, one action, the headline numbers on the right */}
      <TitleRow metrics={metrics} loading={metricsLoading} title="Dashboard" />

      <div className={summaryOpen ? 'grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]' : 'grid grid-cols-1 gap-6'}>
      <div className="min-w-0 space-y-8">
      {RENTAL_INDUSTRY ? (
        <div className="flex items-center gap-4 overflow-hidden rounded-[26px] bg-card px-6 py-4">
          <p className="flex-1 text-sm text-muted-foreground">{labels.heroTagline}</p>
          <Image src="/clients/ashwheelz-fleet/forklift.png" alt="" aria-hidden width={200} height={160} className="h-14 w-auto object-contain" />
          <Image src="/clients/ashwheelz-fleet/transporter.png" alt="" aria-hidden width={240} height={160} className="h-14 w-auto object-contain" />
        </div>
      ) : null}

      {hasFeature('leads') && <NewLeads leads={newLeads.leads} total={newLeads.total} loading={newLeadsLoading} />}
      {hasFeature('leads') && <FollowUps leads={followUps.leads} total={followUps.total} loading={followUpsLoading} />}

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
      <div id="activity" className="scroll-mt-4">
        <ActivityFeed items={activity} loading={activityLoading} />
      </div>
      </div>

      {/* Right column — briefing + latest activity, stays in view */}
      {summaryOpen && (
        <div className="min-w-0">
          <SummaryPanel activity={activity} loading={activityLoading} onHide={() => toggleSummary(false)} />
        </div>
      )}
      </div>
      {!summaryOpen && <SummaryReopen onShow={() => toggleSummary(true)} />}
    </div>
  )
}
