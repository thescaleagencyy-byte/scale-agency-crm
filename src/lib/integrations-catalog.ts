// Integration Hub catalog — pure data, safe for client + server.
// WhatsApp and n8n check REAL existing tables (whatsapp_config,
// n8n_config) since those integrations already work in this app;
// everything else is genuinely not connected yet and reads from the
// new `integrations` table. No service here is ever shown as
// "connected" unless a real row proves it.

export type IntegrationCategory = 'messaging' | 'email' | 'calendar' | 'payments' | 'commerce' | 'productivity' | 'automation'

export interface IntegrationDef {
  service: string
  name: string
  category: IntegrationCategory
  description: string
  /** If true, status comes from an existing real table, not the new `integrations` table. */
  managedElsewhere?: { table: string; settingsHref: string }
  docsHint: string
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
    docsHint: 'Needs a Meta Developer App (same type as WhatsApp Business) with Instagram Graph API access.',
  },
  {
    service: 'facebook',
    name: 'Facebook',
    category: 'messaging',
    description: 'Page messaging, comment replies, ad insights.',
    docsHint: 'Needs a Meta Developer App with Facebook Graph API access.',
  },
  {
    service: 'gmail',
    name: 'Gmail',
    category: 'email',
    description: 'Send/receive customer emails.',
    docsHint: 'Needs a Google Cloud project + OAuth consent screen + Gmail API scope.',
  },
  {
    service: 'outlook',
    name: 'Outlook',
    category: 'email',
    description: 'Send/receive customer emails via Microsoft 365.',
    docsHint: 'Needs an Azure AD app registration with Mail.Send/Mail.Read permissions.',
  },
  {
    service: 'google_calendar',
    name: 'Google Calendar',
    category: 'calendar',
    description: 'Two-way sync for appointments.',
    docsHint: 'Needs a Google Cloud project + OAuth + Calendar API scope.',
  },
  {
    service: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'International card payments, subscription billing.',
    docsHint: 'Needs a Stripe account + secret key (test or live).',
  },
  {
    service: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    description: 'Sync orders, products, and customers.',
    docsHint: 'Needs a Shopify custom app + Admin API access token.',
  },
  {
    service: 'woocommerce',
    name: 'WooCommerce',
    category: 'commerce',
    description: 'Sync orders, products, and customers.',
    docsHint: 'Needs REST API keys generated from the WooCommerce store admin.',
  },
  {
    service: 'pos',
    name: 'POS System',
    category: 'commerce',
    description: 'Sync in-store sales and inventory.',
    docsHint: 'Depends on the specific POS vendor — needs their API docs + credentials.',
  },
  {
    service: 'accounting',
    name: 'Accounting Software',
    category: 'productivity',
    description: 'Sync invoices and revenue (QuickBooks, Xero, etc).',
    docsHint: 'Depends on the specific provider — needs their OAuth app credentials.',
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
    docsHint: 'Needs a Slack App with an Incoming Webhook or bot token.',
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
