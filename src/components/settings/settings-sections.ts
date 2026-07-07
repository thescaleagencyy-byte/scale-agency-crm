import {
  Coins,
  FileText,
  LayoutGrid,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
  Workflow,
  MessageSquareText,
  Webhook,
  Building2,
  Route,
  ShieldCheck,
  Brush,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { FEATURE_GATING_ENABLED } from '@/lib/features';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'whatsapp',
  'number-health',
  'n8n',
  'ai',
  'templates',
  'saved-replies',
  'routing',
  'fields',
  'deals',
  'members',
  'webhooks',
  'workspaces',
  'branding',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  'number-health': { id: 'number-health', label: 'Number Health', icon: ShieldCheck, group: 'workspace' },
  n8n: { id: 'n8n', label: 'n8n', icon: Workflow, group: 'workspace' },
  ai: { id: 'ai', label: 'AI Insights', icon: Sparkles, group: 'workspace' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'workspace' },
  'saved-replies': { id: 'saved-replies', label: 'Saved Replies', icon: MessageSquareText, group: 'workspace' },
  routing: { id: 'routing', label: 'Routing Rules', icon: Route, group: 'workspace' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', label: 'Deals & currency', icon: Coins, group: 'workspace' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'workspace' },
  webhooks: { id: 'webhooks', label: 'Webhooks & API', icon: Webhook, group: 'workspace' },
  workspaces: { id: 'workspaces', label: 'Workspaces', icon: Building2, group: 'workspace' },
  branding: { id: 'branding', label: 'Branding', icon: Brush, group: 'workspace' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

/**
 * Sections that only make sense on the agency's own multi-workspace /
 * multi-team install — Workspaces (multi-brand reseller switching),
 * Templates (bulk message template library), Routing Rules
 * (multi-agent conversation assignment). A single-brand client
 * deployment (NEXT_PUBLIC_FEATURES set) has none of the surrounding
 * surfaces these depend on, so they're noise at best and a dead
 * "nothing happens" click at worst.
 *
 * `whatsapp` joins this list once a deployment's number is connected:
 * a client deployment has exactly one WhatsApp number for its entire
 * life, configured once by the agency. Leaving the editable form live
 * invites a teammate to fat-finger the access token or phone number ID
 * and take the number offline — `Number Health` stays as the
 * read-only status view for the team; credential changes go through
 * the agency.
 *
 * `saved-replies`, `deals`, `branding` are hidden the same way as
 * `whatsapp`: each is a one-time setup choice for a client deployment
 * (canned-reply library the client doesn't run, currency fixed to the
 * client's own currency, white-label branding that only makes sense
 * on the agency's own resold install), so exposing an always-editable
 * settings tab for it is surface area without a use case.
 */
const AGENCY_ONLY_SECTIONS: readonly SettingsSection[] = [
  'workspaces',
  'templates',
  'routing',
  'whatsapp',
  'saved-replies',
  'deals',
  'branding',
];

/** The rail + overview should only ever render these. */
export const VISIBLE_SETTINGS_SECTIONS: readonly SettingsSection[] =
  FEATURE_GATING_ENABLED
    ? SETTINGS_SECTIONS.filter((s) => !AGENCY_ONLY_SECTIONS.includes(s))
    : SETTINGS_SECTIONS;

function isVisibleSection(value: SettingsSection): boolean {
  return VISIBLE_SETTINGS_SECTIONS.includes(value);
}

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw) && isVisibleSection(raw)) return raw;
  return DEFAULT_SECTION;
}
