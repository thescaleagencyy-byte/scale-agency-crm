'use client';

import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { N8nConfig } from '@/components/settings/n8n-config';
import { AIConfigPanel } from '@/components/settings/ai-config-panel';
import { TemplateManager } from '@/components/settings/template-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { SavedRepliesPanel } from '@/components/settings/saved-replies-panel';
import { WebhooksPanel } from '@/components/settings/webhooks-panel';
import { WorkspacesPanel } from '@/components/settings/workspaces-panel';
import { RoutingRulesPanel } from '@/components/settings/routing-rules-panel';
import { NumberHealthPanel } from '@/components/settings/number-health-panel';
import { BrandConfigPanel } from '@/components/settings/brand-config-panel';
import { BillingPanel } from '@/components/settings/billing-panel';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';
import { FEATURE_GATING_ENABLED } from '@/lib/features';

interface PanelEBState { hasError: boolean }
class PanelErrorBoundary extends Component<{ children: ReactNode; label: string }, PanelEBState> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): PanelEBState { return { hasError: true }; }
  componentDidCatch(err: unknown, info: { componentStack?: string }) {
    console.error(`[Settings] panel "${this.props.label}" crashed:`, err, info.componentStack ?? '');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm">
          <p className="font-semibold text-destructive">This section failed to load.</p>
          <button
            type="button"
            className="mt-2 text-xs text-destructive underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { mode } = useTheme();

  const section = resolveSection(searchParams.get('tab'));

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    // Client deployments have no separate Fields & tags rail item —
    // the panel folds into Appearance (tag colours read as "how my
    // dashboard looks" there). Agency installs keep them separate.
    appearance: FEATURE_GATING_ENABLED ? (
      <div className="space-y-10">
        <AppearancePanel />
        <FieldsAndTagsPanel />
      </div>
    ) : (
      <AppearancePanel />
    ),
    whatsapp: <WhatsAppConfig />,
    n8n: <N8nConfig />,
    ai: <AIConfigPanel />,
    templates: <TemplateManager />,
    'saved-replies': <SavedRepliesPanel />,
    routing: <RoutingRulesPanel />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    webhooks: <WebhooksPanel />,
    workspaces: <WorkspacesPanel />,
    'number-health': <NumberHealthPanel />,
    branding: <BrandConfigPanel />,
    billing: <BillingPanel />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything in one place — your account and your workspace. Pick a
          section to manage it.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">
          <PanelErrorBoundary key={section} label={section}>
            {panel[section]}
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  );
}
