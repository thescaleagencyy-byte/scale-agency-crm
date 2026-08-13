// Live credential verification per service — makes a real, read-only
// call against the provider's API before Integration Hub is allowed
// to say "Connected". Only services whose auth is a static token the
// client can generate themselves (no OAuth app owned by us required)
// are wired for real verification here. Services needing an OAuth
// app (Google, Meta long-lived flows, QuickBooks, Outlook) stay
// 'pending' until that one-time app registration exists — see
// integrations-catalog.ts docsHint for exactly what's needed.

export interface VerifyResult {
  ok: boolean
  error?: string
  meta?: Record<string, unknown>
}

async function verifyStripe(fields: Record<string, string>): Promise<VerifyResult> {
  const key = fields.secret_key?.trim()
  if (!key) return { ok: false, error: 'Secret key required.' }
  const res = await fetch('https://api.stripe.com/v1/account', {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return { ok: false, error: `Stripe rejected the key (${res.status}). Check it's a valid secret key.` }
  const data = await res.json()
  return { ok: true, meta: { account: data.business_profile?.name ?? data.id, mode: key.startsWith('sk_live') ? 'live' : 'test' } }
}

async function verifyShopify(fields: Record<string, string>): Promise<VerifyResult> {
  const token = fields.access_token?.trim()
  const shop = fields.shop_domain?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!token || !shop) return { ok: false, error: 'Access token and shop domain are both required.' }
  const res = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  })
  if (!res.ok) return { ok: false, error: `Shopify rejected the token (${res.status}). Check the token and shop domain (e.g. your-store.myshopify.com).` }
  const data = await res.json()
  return { ok: true, meta: { shop: data.shop?.name } }
}

async function verifyWooCommerce(fields: Record<string, string>): Promise<VerifyResult> {
  const key = fields.consumer_key?.trim()
  const secret = fields.consumer_secret?.trim()
  const url = fields.site_url?.trim().replace(/\/$/, '')
  if (!key || !secret || !url) return { ok: false, error: 'Consumer key, consumer secret, and site URL are all required.' }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch(`${url}/wp-json/wc/v3/system_status`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!res.ok) return { ok: false, error: `WooCommerce rejected the credentials (${res.status}). Check the site URL and keys.` }
  return { ok: true }
}

async function verifySlack(fields: Record<string, string>): Promise<VerifyResult> {
  const token = fields.bot_token?.trim()
  if (!token) return { ok: false, error: 'Bot token required.' }
  const res = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!data.ok) return { ok: false, error: `Slack rejected the token: ${data.error ?? 'unknown error'}.` }
  return { ok: true, meta: { team: data.team, botUser: data.user } }
}

async function verifyMetaGraphToken(fields: Record<string, string>): Promise<VerifyResult> {
  const token = fields.page_access_token?.trim()
  if (!token) return { ok: false, error: 'Page access token required.' }
  const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`)
  const data = await res.json()
  if (data.error) return { ok: false, error: `Meta rejected the token: ${data.error.message}.` }
  return { ok: true, meta: { page: data.name } }
}

async function verifyMetaAdsToken(fields: Record<string, string>): Promise<VerifyResult> {
  const adAccountId = fields.ad_account_id?.trim()
  const token = fields.access_token?.trim()
  if (!adAccountId || !token) return { ok: false, error: 'Ad account ID and access token are both required.' }
  const res = await fetch(
    `https://graph.facebook.com/v21.0/act_${adAccountId}?fields=name,account_status,currency&access_token=${encodeURIComponent(token)}`,
  )
  const data = await res.json()
  if (data.error) {
    // Error #200 specifically means the token's system user isn't
    // assigned to this ad account, or lacks ads_read — the most
    // common failure mode here, worth a specific message rather than
    // the generic passthrough every other verifier uses.
    if (data.error.code === 200) {
      return { ok: false, error: "Meta rejected the token: this token's system user isn't assigned to this ad account, or lacks ads_read." }
    }
    return { ok: false, error: `Meta rejected the token: ${data.error.message}.` }
  }
  return { ok: true, meta: { adAccountName: data.name, accountStatus: data.account_status, currency: data.currency } }
}

// Service key → verifier. Services not listed here have no
// no-OAuth-app way to verify a live connection, so they stay
// 'pending' after saving — an honest state, not a broken one.
export const VERIFIERS: Record<string, (fields: Record<string, string>) => Promise<VerifyResult>> = {
  stripe: verifyStripe,
  shopify: verifyShopify,
  woocommerce: verifyWooCommerce,
  slack: verifySlack,
  facebook: verifyMetaGraphToken,
  instagram: verifyMetaGraphToken,
  meta_ads: verifyMetaAdsToken,
}
