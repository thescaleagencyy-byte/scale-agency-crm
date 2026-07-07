"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  TrendingUp,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { CLIENT_NAME, CLIENT_INDUSTRY, hasFeature } from '@/lib/features'
import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { RevenueForecast } from '@/components/dashboard/revenue-forecast'

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
      newContacts:          'New Customers Today',
      newLeads:             'New Leads Today',
      openDeals:            'Active Orders Value',
      dealWord:             'order',
      messagesSent:         'Replies Sent Today',
      chartTitle:           'Order Inquiries Over Time',
      chartSubtitle:        'Daily order & enquiry volume',
      pipelineTitle:        'Order Pipeline',
      pipelineSubtitle:     'Active orders by stage',
    }
    if (ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')) return {
      heroHeadline:         'Rental Operations',
      heroTagline:          'Rental inquiries, lead pipeline & client WhatsApp — live.',
      activeConversations:  'Active Inquiries',
      newContacts:          'New Customers Today',
      newLeads:             'Leads Captured Today',
      openDeals:            'Open Rental Quotes',
      dealWord:             'quote',
      messagesSent:         'Responses Sent Today',
      chartTitle:           'Rental Inquiries Over Time',
      chartSubtitle:        'Daily inquiry & response volume',
      pipelineTitle:        'Quote Pipeline',
      pipelineSubtitle:     'Active quotes by stage',
    }
    return {
      heroHeadline:         'Operations Dashboard',
      heroTagline:          'Your WhatsApp pipeline — live and ready.',
      activeConversations:  'Active Conversations',
      newContacts:          'New Contacts Today',
      newLeads:             'New Leads Today',
      openDeals:            'Open Deals Value',
      dealWord:             'deal',
      messagesSent:         'Messages Sent Today',
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
        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 80% 100% at 70% 0%, black 30%, transparent 100%)',
          }}
        />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
              {heroLabel} · {dateLine}
            </p>
            <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              {greeting}
              {firstName ? (
                <>
                  ,{' '}
                  <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
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
            <span className="text-xs font-semibold text-primary">
              {labels.heroHeadline} · Live
            </span>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={labels.activeConversations}
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(metrics.activeConversations.previous, 'new today vs yesterday'),
              }}
            />
            <MetricCard
              title={labels.newContacts}
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign:
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                  'vs yesterday',
                ),
              }}
            />
            {hasFeature('pipelines') ? (
              <MetricCard
                title={labels.openDeals}
                value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
                icon={DollarSign}
                subtitle={`${metrics.openDealsCount} open ${labels.dealWord}${metrics.openDealsCount === 1 ? '' : 's'}`}
              />
            ) : metrics.newLeadsToday ? (
              <MetricCard
                title={labels.newLeads}
                value={metrics.newLeadsToday.current.toLocaleString()}
                icon={TrendingUp}
                delta={{
                  sign:
                    metrics.newLeadsToday.current - metrics.newLeadsToday.previous,
                  label: deltaLabel(
                    metrics.newLeadsToday.current - metrics.newLeadsToday.previous,
                    'vs yesterday',
                  ),
                }}
              />
            ) : null}
            <MetricCard
              title={labels.messagesSent}
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              delta={{
                sign:
                  metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                label: deltaLabel(
                  metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                  'vs yesterday',
                ),
              }}
            />
          </>
        )}
      </div>

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

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Revenue forecast — deal-based, meaningless without pipelines */}
      {hasFeature('pipelines') && <RevenueForecast currency={defaultCurrency} />}

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}

// ------------------------------------------------------------

function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `No change ${suffix}`
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}
