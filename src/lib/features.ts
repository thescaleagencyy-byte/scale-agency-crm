// Build-time feature gating via NEXT_PUBLIC_FEATURES env var.
// Not set (or empty) = all features enabled (Scale Agency full CRM).
// Set to comma-separated keys = only those features visible + accessible.
//
// Example: NEXT_PUBLIC_FEATURES=dashboard,n8n
// Deployments: AshWheelz, Sultan — dashboard + n8n only.

const raw = process.env.NEXT_PUBLIC_FEATURES ?? ''

export const FEATURE_GATING_ENABLED = raw.trim().length > 0

export const ENABLED_FEATURES: ReadonlySet<string> = FEATURE_GATING_ENABLED
  ? new Set(raw.split(',').map((f) => f.trim()).filter(Boolean))
  : new Set<string>()

export function hasFeature(key: string): boolean {
  if (!FEATURE_GATING_ENABLED) return true
  return ENABLED_FEATURES.has(key)
}

// Client branding — set on per-client deployments to white-label the UI.
// Empty string = Scale Agency default branding.
export const CLIENT_NAME = process.env.NEXT_PUBLIC_CLIENT_NAME ?? ''
export const CLIENT_INDUSTRY = process.env.NEXT_PUBLIC_CLIENT_INDUSTRY ?? ''
// Human-readable app name shown in UI copy (invites, dialogs, config pages).
export const APP_NAME = CLIENT_NAME ? `${CLIENT_NAME} Dashboard` : 'Scale Agency CRM'
// Primary brand color for client deployments. Falls back to Scale Agency neon green.
export const PRIMARY_COLOR = process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? '#39ff14'

// Path → feature key map used by middleware to block disabled routes.
export const PATH_FEATURE_MAP: Record<string, string> = {
  '/inbox':         'inbox',
  '/contacts':      'contacts',
  '/leads':         'leads',
  '/pipelines':     'pipelines',
  '/broadcasts':    'broadcasts',
  '/drip':          'drip',
  '/appointments':  'appointments',
  '/analytics':     'analytics',
  '/qr-codes':      'qr-codes',
  '/flows':         'flows',
  '/flows-builder': 'flows',
  '/automations':   'automations',
  '/n8n':           'n8n',
  '/dashboard':     'dashboard',
}
