// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
  /** Only populated when the `leads` feature is enabled — used as the
   *  third metric card on deployments where `pipelines` is gated off. */
  newLeadsToday: MetricDelta | null
  /** Rolling 7-day windows. Low-volume deployments show zeros on
   *  today-vs-yesterday cards most mornings — a dead dashboard. The
   *  cards lead with the 7-day number and show today as the delta. */
  newContacts7d: number
  messagesSent7d: number
  newLeads7d: number | null
  /** Open conversations with at least one message today — reply coverage. */
  conversationsRepliedToday: number
  dealsWonCount: number
  dealsTotalCount: number
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export interface DemandSlice {
  label: string
  count: number
}

export interface SiteSlice {
  label: string
  count: number
  lastActivity: string
}

export interface RecentContact {
  name: string | null
  phone: string
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'
  | 'lead'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}

export interface MetaAdsCampaignRow {
  campaignId: string
  campaignName: string
  spend: number
  impressions: number
  clicks: number
  /** Click-through rate as a fraction (0.031 = 3.1%), null when impressions is 0. */
  ctr: number | null
  /** Conversations that started from this campaign's ads (ad_source_id match). */
  adConversations: number
  qualifiedLeads: number
  /** null when qualifiedLeads is 0 — never render a misleading $0.00. */
  costPerQualifiedLead: number | null
  wonValue: number
  /** null when spend or wonValue is 0 — ROAS is structurally sparse until enough linked won-deals accumulate. */
  roas: number | null
  currency: string
}

export interface MetaAdsPerformance {
  campaigns: MetaAdsCampaignRow[]
  totalSpend: number
  totalImpressions: number
  totalClicks: number
  /** null when totalImpressions is 0. */
  ctr: number | null
  /** Cost per click — null when totalClicks is 0. */
  cpc: number | null
  /** Cost per 1,000 impressions — null when totalImpressions is 0. */
  cpm: number | null
  /** Conversations that started from a tracked ad (ad_source_id match). */
  totalConversations: number
  totalQualifiedLeads: number
  /** null when totalQualifiedLeads is 0. */
  costPerQualifiedLead: number | null
  totalWonValue: number
  totalWonDeals: number
  /** null when totalSpend or totalWonValue is 0. */
  roas: number | null
  currency: string
}

export interface MetaAdsDailyPoint {
  /** YYYY-MM-DD local */
  date: string
  spend: number
  impressions: number
  clicks: number
}
