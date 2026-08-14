// ============================================================
// GET /api/meta-ads/cron
//
// Syncs Meta Marketing API ad-level insights into meta_ad_insights
// for every account with a connected `meta_ads` integration. Same
// shape as /api/recovery/cron: protected by x-cron-secret header or
// ?secret= query param against META_ADS_CRON_SECRET, scheduled via
// an external pinger (no Vercel Cron config exists in this repo).
//
// Trailing window defaults to 3 days — Meta insights can shift for
// ~28h after the fact, so re-syncing the last few days on every run
// isn't optional, it's how the numbers stay accurate. Pass
// ?days=90 once per newly-connected ad account for the one-time
// historical backfill (so ads referenced by late-arriving
// conversations already have a campaign mapping) — same route,
// wider range, admin-triggered manually rather than on a schedule.
// ============================================================

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decryptText } from '@/lib/crypto'
import { fetchAdInsights } from '@/lib/meta-ads/marketing-api'
import { checkCronAuth } from '@/lib/cron-auth'

const DEFAULT_WINDOW_DAYS = 3

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const authError = checkCronAuth(request, 'META_ADS_CRON_SECRET')
  if (authError) return authError

  const url = new URL(request.url)

  const daysParam = Number(url.searchParams.get('days'))
  const windowDays = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : DEFAULT_WINDOW_DAYS

  const now = new Date()
  const since = isoDate(new Date(now.getTime() - windowDays * 86400000))
  const until = isoDate(now)

  const admin = supabaseAdmin()

  const { data: integrations, error } = await admin
    .from('integrations')
    .select('id, account_id, credentials_encrypted, config')
    .eq('service', 'meta_ads')
    .eq('status', 'connected')

  if (error) {
    console.error('[meta-ads/cron] fetch integrations failed:', error)
    return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 })
  }

  let syncedAccounts = 0
  let upsertedRows = 0
  const errors: { account_id: string; error: string }[] = []

  for (const integration of integrations ?? []) {
    try {
      if (!integration.credentials_encrypted) throw new Error('No credentials stored.')
      const fields = JSON.parse(decryptText(integration.credentials_encrypted)) as {
        ad_account_id?: string
        access_token?: string
      }
      const adAccountId = fields.ad_account_id?.trim()
      const accessToken = fields.access_token?.trim()
      if (!adAccountId || !accessToken) throw new Error('Missing ad_account_id or access_token.')

      // Meta's Insights API never returns a `currency` field on ad-level
      // rows (it's an ad-account-level property, not a per-insight one).
      // The real currency was captured once at connect time by
      // verifyMetaAdsToken and stored in integrations.config — read it
      // from there rather than defaulting to USD, which would silently
      // mislabel e.g. PKR spend as if it were ~280x more expensive.
      const currency =
        (integration.config as { currency?: string } | null)?.currency?.trim() || null

      const rows = await fetchAdInsights({ adAccountId, accessToken, since, until })

      for (const row of rows) {
        const { error: upsertErr } = await admin.from('meta_ad_insights').upsert(
          {
            account_id: integration.account_id,
            ad_account_id: adAccountId,
            date: row.date_start,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name ?? null,
            adset_id: row.adset_id ?? null,
            adset_name: row.adset_name ?? null,
            ad_id: row.ad_id,
            ad_name: row.ad_name ?? null,
            spend: Number(row.spend ?? 0),
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            reach: Number(row.reach ?? 0),
            currency,
            raw: row,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,ad_account_id,ad_id,date' },
        )
        if (upsertErr) {
          console.error('[meta-ads/cron] upsert failed:', integration.account_id, row.ad_id, row.date_start, upsertErr)
        } else {
          upsertedRows++
        }
      }

      await admin
        .from('integrations')
        .update({ last_checked_at: new Date().toISOString(), last_error: null })
        .eq('id', integration.id)
      syncedAccounts++
    } catch (syncErr) {
      const message = syncErr instanceof Error ? syncErr.message : 'Unknown sync error'
      console.error('[meta-ads/cron] sync failed:', integration.account_id, message)
      errors.push({ account_id: integration.account_id, error: message })
      // Deliberately NOT flipping status to 'error' here — the cron
      // query below filters on status='connected', so doing that
      // would permanently drop this integration out of future runs
      // over what might be a transient failure. last_error alone
      // still surfaces the problem in the Integration Hub UI.
      await admin
        .from('integrations')
        .update({ last_checked_at: new Date().toISOString(), last_error: message })
        .eq('id', integration.id)
    }
  }

  return NextResponse.json({ syncedAccounts, upsertedRows, windowDays, since, until, errors })
}
