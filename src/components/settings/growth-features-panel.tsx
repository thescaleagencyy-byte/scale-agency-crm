'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SettingsPanelHead } from './settings-panel-head';
import { Loader2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';

interface Settings {
  owner_whatsapp_number: string | null;
  template_language: string;
  review_request_enabled: boolean;
  review_request_template: string | null;
  review_request_link: string | null;
  reactivation_enabled: boolean;
  reactivation_template: string | null;
  reactivation_min_days: number;
  knowledge_gap_enabled: boolean;
  referral_detection_enabled: boolean;
  referral_alert_template: string | null;
  upsell_detector_enabled: boolean;
  upsell_detector_template: string | null;
}

interface TemplateOption { name: string; language: string }

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'} disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function TemplateSelect({
  value, onChange, templates, disabled,
}: { value: string | null; onChange: (v: string | null) => void; templates: TemplateOption[]; disabled: boolean }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground disabled:opacity-50"
    >
      <option value="">Select an approved template…</option>
      {templates.map((t) => (<option key={t.name} value={t.name}>{t.name}</option>))}
    </select>
  );
}

export function GrowthFeaturesPanel() {
  const canManage = useCan('edit-settings');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/growth-features/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setTemplates(data.approvedTemplates ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const res = await fetch('/api/growth-features/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Save failed'); setSaving(false); return; }
    setSettings(json.settings);
    toast.success('Growth feature settings saved');
    setSaving(false);
  }

  if (loading || !settings) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => s && { ...s, [key]: value });

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Growth Features"
        description="Revenue left on the table, not problems to fix: reviews nobody asked for, dead leads nobody followed up with, referrals nobody tracked, upsells nobody mentioned."
      />

      <div className="card-elevated p-5 space-y-4">
        <p className="text-sm font-medium text-foreground">Where owner alerts go (referral + upsell only)</p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Your WhatsApp number</Label>
          <Input
            type="text"
            placeholder="+923001234567"
            value={settings.owner_whatsapp_number ?? ''}
            onChange={(e) => set('owner_whatsapp_number', e.target.value)}
            disabled={!canManage}
            className="border-border bg-muted text-foreground"
          />
        </div>
      </div>

      {/* Review requests */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Review request autopilot</p>
            <p className="text-xs text-muted-foreground">Automatically asks customers for a review right after a deal closes, invoice is paid, or appointment completes.</p>
          </div>
          <Toggle checked={settings.review_request_enabled} onChange={() => set('review_request_enabled', !settings.review_request_enabled)} disabled={!canManage} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Review link (Google/Facebook/etc)</Label>
            <Input type="text" placeholder="https://g.page/r/..." value={settings.review_request_link ?? ''} onChange={(e) => set('review_request_link', e.target.value)} disabled={!canManage} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <TemplateSelect value={settings.review_request_template} onChange={(v) => set('review_request_template', v)} templates={templates} disabled={!canManage} />
          </div>
        </div>
      </div>

      {/* Dead lead reactivation */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Dead lead reactivation</p>
            <p className="text-xs text-muted-foreground">One-time re-engagement message to leads marked lost and untouched for a while — free money sitting in your lost pile.</p>
          </div>
          <Toggle checked={settings.reactivation_enabled} onChange={() => set('reactivation_enabled', !settings.reactivation_enabled)} disabled={!canManage} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lost for at least (days)</Label>
            <Input type="number" min={7} max={365} value={settings.reactivation_min_days} onChange={(e) => set('reactivation_min_days', Number(e.target.value))} disabled={!canManage} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <TemplateSelect value={settings.reactivation_template} onChange={(v) => set('reactivation_template', v)} templates={templates} disabled={!canManage} />
          </div>
        </div>
      </div>

      {/* Knowledge gap */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Knowledge gap finder</p>
            <p className="text-xs text-muted-foreground">Finds questions customers keep asking that aren&apos;t in your saved knowledge yet. Shows up on the Business Knowledge page — no WhatsApp alert, review when convenient.</p>
          </div>
          <Toggle checked={settings.knowledge_gap_enabled} onChange={() => set('knowledge_gap_enabled', !settings.knowledge_gap_enabled)} disabled={!canManage} />
        </div>
      </div>

      {/* Referral detection */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Referral auto-detection</p>
            <p className="text-xs text-muted-foreground">Catches when a new customer mentions being referred by an existing one, and alerts you so you can thank/reward them.</p>
          </div>
          <Toggle checked={settings.referral_detection_enabled} onChange={() => set('referral_detection_enabled', !settings.referral_detection_enabled)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Template</Label>
          <TemplateSelect value={settings.referral_alert_template} onChange={(v) => set('referral_alert_template', v)} templates={templates} disabled={!canManage} />
        </div>
      </div>

      {/* Upsell detector */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Upsell moment detector</p>
            <p className="text-xs text-muted-foreground">When a customer who just bought mentions a related need, AI drafts a follow-up offer and sends it to YOU — never the customer. You decide whether to use it.</p>
          </div>
          <Toggle checked={settings.upsell_detector_enabled} onChange={() => set('upsell_detector_enabled', !settings.upsell_detector_enabled)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Template</Label>
          <TemplateSelect value={settings.upsell_detector_template} onChange={(v) => set('upsell_detector_template', v)} templates={templates} disabled={!canManage} />
        </div>
      </div>

      {canManage && (
        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
          Save
        </Button>
      )}
    </div>
  );
}
