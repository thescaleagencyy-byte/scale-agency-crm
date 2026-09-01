/**
 * Meta Marketing API helpers — mirrors the named-args style of
 * src/lib/whatsapp/meta-api.ts.
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

interface MetaErrorResponse {
  error?: { message?: string; code?: number; type?: string }
}

async function throwMetaError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const data = (await response.json()) as MetaErrorResponse
    if (data.error?.message) message = data.error.message
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  throw new Error(message)
}

export interface MetaAdInsightRow {
  campaign_id: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id: string
  ad_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  reach?: string
  date_start: string
  date_stop: string
}

export interface FetchAdInsightsArgs {
  adAccountId: string
  accessToken: string
  /** YYYY-MM-DD */
  since: string
  /** YYYY-MM-DD */
  until: string
}

const INSIGHTS_FIELDS = [
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'reach',
  'date_start', 'date_stop',
].join(',')

/**
 * Fetch ad-level insights (spend, impressions, clicks, reach) with
 * campaign + ad identity attached to every row — level=ad returns
 * both together, so no separate per-ad lookup is needed. Deliberately
 * skips `actions`/`results`: Meta's own CTWA "results" is just
 * message-starts, which `conversations` already counts natively, and
 * qualification truth lives in this CRM (is_lead), not Meta's.
 * Follows paging.next until exhausted.
 */
export async function fetchAdInsights(args: FetchAdInsightsArgs): Promise<MetaAdInsightRow[]> {
  const { adAccountId, accessToken, since, until } = args
  const rows: MetaAdInsightRow[] = []

  let url: string | null =
    `${META_API_BASE}/act_${adAccountId}/insights?` +
    new URLSearchParams({
      level: 'ad',
      fields: INSIGHTS_FIELDS,
      time_range: JSON.stringify({ since, until }),
      time_increment: '1',
      limit: '500',
      access_token: accessToken,
    }).toString()

  while (url) {
    const response: Response = await fetch(url)
    if (!response.ok) {
      await throwMetaError(response, `Meta Marketing API error: ${response.status}`)
    }
    const data = (await response.json()) as {
      data?: MetaAdInsightRow[]
      paging?: { next?: string }
    }
    rows.push(...(data.data ?? []))
    url = data.paging?.next ?? null
  }

  return rows
}
