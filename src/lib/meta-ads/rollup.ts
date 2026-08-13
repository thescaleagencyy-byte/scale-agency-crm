import type { SupabaseClient } from '@supabase/supabase-js'
import { daysAgoStart, localDayKey } from '@/lib/dashboard/date-utils'
import type { MetaAdsCampaignRow, MetaAdsPerformance } from '@/lib/dashboard/types'

type DB = SupabaseClient

const EMPTY_RESULT: MetaAdsPerformance = {
  campaigns: [],
  totalSpend: 0,
  totalQualifiedLeads: 0,
  costPerQualifiedLead: null,
  currency: 'USD',
}

/**
 * Joins meta_ad_insights (spend/impressions/clicks) against
 * conversations (ad_source_id -> qualified leads) and won deals
 * (conversation_id -> revenue) to produce per-campaign performance.
 * No separate campaign dimension table — campaign_id/campaign_name
 * ride along on every insights row already, so campaign rollup is
 * just grouping those rows; the ad_id -> campaign_id map that falls
 * out of that grouping is what conversations/deals join through.
 */
export async function loadMetaAdsCampaignPerformance(
  db: DB,
  rangeDays: number,
): Promise<MetaAdsPerformance> {
  const sinceDate = localDayKey(daysAgoStart(rangeDays - 1))
  const untilDate = localDayKey(new Date())
  const sinceIso = daysAgoStart(rangeDays - 1).toISOString()

  const { data: insightRows } = await db
    .from('meta_ad_insights')
    .select('ad_id, campaign_id, campaign_name, spend, impressions, clicks, currency')
    .gte('date', sinceDate)
    .lte('date', untilDate)

  const rows = (insightRows ?? []) as {
    ad_id: string
    campaign_id: string
    campaign_name: string | null
    spend: number | null
    impressions: number | null
    clicks: number | null
    currency: string | null
  }[]
  if (rows.length === 0) return EMPTY_RESULT

  interface CampaignAgg {
    campaignId: string
    campaignName: string
    spend: number
    impressions: number
    clicks: number
    currency: string
  }
  const campaignMap = new Map<string, CampaignAgg>()
  const adToCampaign = new Map<string, string>()

  for (const r of rows) {
    adToCampaign.set(r.ad_id, r.campaign_id)
    let c = campaignMap.get(r.campaign_id)
    if (!c) {
      c = {
        campaignId: r.campaign_id,
        campaignName: r.campaign_name ?? r.campaign_id,
        spend: 0,
        impressions: 0,
        clicks: 0,
        currency: r.currency ?? 'USD',
      }
      campaignMap.set(r.campaign_id, c)
    }
    c.spend += Number(r.spend ?? 0)
    c.impressions += Number(r.impressions ?? 0)
    c.clicks += Number(r.clicks ?? 0)
  }

  const allAdIds = Array.from(adToCampaign.keys())

  const { data: convRows } = await db
    .from('conversations')
    .select('id, contact_id, ad_source_id, is_lead, created_at')
    .in('ad_source_id', allAdIds)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })

  const conversations = (convRows ?? []) as {
    id: string
    contact_id: string | null
    ad_source_id: string | null
    is_lead: boolean
    created_at: string
  }[]

  interface CampaignLeadAgg {
    total: number
    qualified: number
  }
  const leadsByCampaign = new Map<string, CampaignLeadAgg>()
  const conversationIdToCampaign = new Map<string, string>()
  // Most-recent-first order above means the first assignment per
  // contact wins here — same "newest conversation" convention
  // deal-form.tsx uses when linking a deal to a conversation.
  const contactIdToCampaign = new Map<string, string>()

  for (const conv of conversations) {
    const campaignId = conv.ad_source_id ? adToCampaign.get(conv.ad_source_id) : undefined
    if (!campaignId) continue
    conversationIdToCampaign.set(conv.id, campaignId)
    if (conv.contact_id && !contactIdToCampaign.has(conv.contact_id)) {
      contactIdToCampaign.set(conv.contact_id, campaignId)
    }
    let agg = leadsByCampaign.get(campaignId)
    if (!agg) {
      agg = { total: 0, qualified: 0 }
      leadsByCampaign.set(campaignId, agg)
    }
    agg.total += 1
    if (conv.is_lead) agg.qualified += 1
  }

  const { data: dealRows } = await db
    .from('deals')
    .select('value, conversation_id, contact_id, closed_at')
    .eq('status', 'won')
    .gte('closed_at', sinceIso)

  const deals = (dealRows ?? []) as {
    value: number | null
    conversation_id: string | null
    contact_id: string | null
    closed_at: string | null
  }[]

  const wonByCampaign = new Map<string, number>()
  for (const deal of deals) {
    // Forward-only conversation_id link (deal-form.tsx now sets this
    // on every save) takes priority. Falls back to a looser
    // contact_id join for deals created before that fix — no
    // DB-enforced 1:1, so a contact with conversations across
    // multiple campaigns can misattribute; acceptable for a v1 rollup.
    const campaignId =
      (deal.conversation_id && conversationIdToCampaign.get(deal.conversation_id)) ||
      (deal.contact_id && contactIdToCampaign.get(deal.contact_id)) ||
      null
    if (!campaignId) continue
    wonByCampaign.set(campaignId, (wonByCampaign.get(campaignId) ?? 0) + Number(deal.value ?? 0))
  }

  const campaigns: MetaAdsCampaignRow[] = Array.from(campaignMap.values())
    .map((c) => {
      const leadAgg = leadsByCampaign.get(c.campaignId)
      const qualifiedLeads = leadAgg?.qualified ?? 0
      const wonValue = wonByCampaign.get(c.campaignId) ?? 0
      return {
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
        adConversations: leadAgg?.total ?? 0,
        qualifiedLeads,
        costPerQualifiedLead: qualifiedLeads > 0 ? c.spend / qualifiedLeads : null,
        wonValue,
        roas: c.spend > 0 && wonValue > 0 ? wonValue / c.spend : null,
        currency: c.currency,
      }
    })
    .sort((a, b) => b.spend - a.spend)

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0)
  const totalQualifiedLeads = campaigns.reduce((sum, c) => sum + c.qualifiedLeads, 0)

  return {
    campaigns,
    totalSpend,
    totalQualifiedLeads,
    costPerQualifiedLead: totalQualifiedLeads > 0 ? totalSpend / totalQualifiedLeads : null,
    currency: campaigns[0]?.currency ?? 'USD',
  }
}
