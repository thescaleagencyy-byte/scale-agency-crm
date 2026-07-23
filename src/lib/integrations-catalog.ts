// Integration Hub catalog — pure data, safe for client + server.
// WhatsApp and n8n check REAL existing tables (whatsapp_config,
// n8n_config) since those integrations already work in this app;
// everything else is genuinely not connected yet and reads from the
// new `integrations` table. No service here is ever shown as
// "connected" unless a real row proves it.

export type IntegrationCategory = 'messaging' | 'email' | 'calendar' | 'payments' | 'commerce' | 'productivity' | 'automation'

export interface CredentialField {
  key: string
  label: string
  placeholder: string
}

export interface IntegrationDef {
  service: string
  name: string
  category: IntegrationCategory
  description: string
  /** If true, status comes from an existing real table, not the new `integrations` table. */
  managedElsewhere?: { table: string; settingsHref: string }
  docsHint: string
  /**
   * Present only for services with a real live-verify check (see
   * integration-verify.ts) — the client (or setup team) pastes their
   * own static token/key, no OAuth app owned by us required, and the
   * connection is verified against the real API before it's ever
   * shown as "Connected". Services without this fall back to a single
   * generic credential field and stay 'pending' (unverifiable) —
   * true plug-and-play for those needs Umer to register a one-time
   * OAuth app first (see docsHint).
   */
  credentialFields?: CredentialField[]
}

export const INTEGRATIONS_CATALOG: IntegrationDef[] = [
  {
    service: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'messaging',
    description: 'Send/receive messages, the core of this CRM.',
    managedElsewhere: { table: 'whatsapp_config', settingsHref: '/settings?tab=whatsapp' },
    docsHint: 'Already wired — manage in Settings → WhatsApp.',
  },
  {
    service: 'n8n',
    name: 'n8n',
    category: 'automation',
    description: 'Trigger and monitor automation workflows.',
    managedElsewhere: { table: 'n8n_config', settingsHref: '/settings?tab=n8n' },
    docsHint: 'Already wired — manage in Settings → n8n.',
  },
  {
    service: 'instagram',
    name: 'Instagram',
    category: 'messaging',
    description: 'DMs, comment replies, content publishing.',
    docsHint: 'Paste a Page/Instagram access token generated from Meta Business Suite → Graph API Explorer. Verified live on save.',
    credentialFields: [{ key: 'page_access_token', label: 'Access token', placeholder: 'EAAG...' }],
  },
  {
    service: 'facebook',
    name: 'Facebook',
    category: 'messaging',
    description: 'Page messaging, comment replies, ad insights.',
    docsHint: 'Paste a Page access token generated from Meta Business Suite → Graph API Explorer. Verified live on save.',
    credentialFields: [{ key: 'page_access_token', label: 'Access token', placeholder: 'EAAG...' }],
  },
  {
    service: 'gmail',
    name: 'Gmail',
    category: 'email',
    description: 'Send/receive customer emails.',
    docsHint: 'Blocked on a one-time setup: Umer needs to register one Google Cloud OAuth app (shared across all clients) before this can be a "Connect with Google" button. Not client-specific work.',
  },
  {
    service: 'outlook',
    name: 'Outlook',
    category: 'email',
    description: 'Send/receive customer emails via Microsoft 365.',
    docsHint: 'Blocked on a one-time setup: Umer needs to register one Azure AD app (shared across all clients) with Mail.Send/Mail.Read permissions.',
  },
  {
    service: 'google_calendar',
    name: 'Google Calendar',
    category: 'calendar',
    description: 'Two-way sync for appointments.',
    docsHint: 'Same Google Cloud OAuth app as Gmail — one-time setup, then reusable across every client.',
  },
  {
    service: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'International card payments, subscription billing.',
    docsHint: 'Paste your Stripe secret key from Dashboard → Developers → API keys. Verified live on save.',
    credentialFields: [{ key: 'secret_key', label: 'Secret key', placeholder: 'sk_live_... or sk_test_...' }],
  },
  {
    service: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    description: 'Sync orders, products, and customers.',
    docsHint: 'Create a custom app in Shopify Admin → Settings → Apps → Develop apps, install it, and paste the Admin API access token. Verified live on save.',
    credentialFields: [
      { key: 'shop_domain', label: 'Shop domain', placeholder: 'your-store.myshopify.com' },
      { key: 'access_token', label: 'Admin API access token', placeholder: 'shpat_...' },
    ],
  },
  {
    service: 'woocommerce',
    name: 'WooCommerce',
    category: 'commerce',
    description: 'Sync orders, products, and customers.',
    docsHint: 'Generate REST API keys from WooCommerce → Settings → Advanced → REST API. Verified live on save.',
    credentialFields: [
      { key: 'site_url', label: 'Site URL', placeholder: 'https://yourstore.com' },
      { key: 'consumer_key', label: 'Consumer key', placeholder: 'ck_...' },
      { key: 'consumer_secret', label: 'Consumer secret', placeholder: 'cs_...' },
    ],
  },
  {
    service: 'pos',
    name: 'POS System',
    category: 'commerce',
    description: 'Sync in-store sales and inventory.',
    docsHint: 'Vendor-specific — tell us which POS (Foodics, Odoo, etc) and we add a real verified connector for it, same pattern as Stripe/Shopify above.',
  },
  {
    service: 'accounting',
    name: 'Accounting Software',
    category: 'productivity',
    description: 'Sync invoices and revenue (QuickBooks, Xero, etc).',
    docsHint: 'QuickBooks/Xero both need an OAuth app registered once (shared across clients) — tell us which one and Umer registers it.',
  },
  {
    service: 'google_drive',
    name: 'Google Drive',
    category: 'productivity',
    description: 'Store and share generated documents/contracts.',
    docsHint: 'Needs a Google Cloud project + OAuth + Drive API scope.',
  },
  {
    service: 'slack',
    name: 'Slack',
    category: 'productivity',
    description: 'Internal team notifications.',
    docsHint: 'Create a Slack App at api.slack.com/apps, add a Bot Token Scope, install to workspace, paste the Bot User OAuth Token. Verified live on save.',
    credentialFields: [{ key: 'bot_token', label: 'Bot token', placeholder: 'xoxb-...' }],
  },
]

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  messaging: 'Messaging',
  email: 'Email',
  calendar: 'Calendar',
  payments: 'Payments',
  commerce: 'Commerce',
  productivity: 'Productivity',
  automation: 'Automation',
}
