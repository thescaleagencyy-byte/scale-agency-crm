'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SettingsPanelHead } from './settings-panel-head';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';

interface Settings {
  owner_whatsapp_number: string | null;
  template_language: string;
  staff_audit_enabled: boolean;
  staff_audit_template: string | null;
  staff_audit_min_score: number;
  complaint_alert_enabled: boolean;
  complaint_alert_template: string | null;
  cashflow_alert_enabled: boolean;
  cashflow_alert_template: string | null;
  cashflow_danger_days: number;
  noshow_alert_enabled: boolean;
  noshow_alert_template: string | null;
  price_objection_enabled: boolean;
  price_objection_template: string | null;
  price_objection_discount_cap: number;
  dialect_detection_enabled: boolean;
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

export function AIAlertsPanel() {
  const canManage = useCan('edit-settings');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/ai-alerts/settings')
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
    const res = await fetch('/api/ai-alerts/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Save failed'); setSaving(false); return; }
    setSettings(json.settings);
    toast.success('AI alert settings saved');
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
        title="AI Alerts"
        description="Proactive WhatsApp pings for things that normally go unnoticed until it's too late — slow staff replies, a customer about to leave a bad review, cash coming due, a booking likely to no-show, a lead quietly stalling on price."
      />

      <div className="card-elevated p-5 space-y-4">
        <p className="text-sm font-medium text-foreground">Where alerts go</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Your WhatsApp number (receives all alerts below)</Label>
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
        {templates.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No approved templates yet — submit one in Settings → Templates first. Each alert below needs its own approved template (Meta requires one for any business-initiated WhatsApp message).</p>
        )}
      </div>

      {/* Staff Accountability Audit */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Staff accountability audit</p>
            <p className="text-xs text-muted-foreground">AI scores every closed/idle conversation for reply speed, tone, and outcome. Alerts you when a score falls below threshold.</p>
          </div>
          <Toggle checked={settings.staff_audit_enabled} onChange={() => set('staff_audit_enabled', !settings.staff_audit_enabled)} disabled={!canManage} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Alert when score below</Label>
            <Input type="number" min={0} max={100} value={settings.staff_audit_min_score} onChange={(e) => set('staff_audit_min_score', Number(e.target.value))} disabled={!canManage} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <TemplateSelect value={settings.staff_audit_template} onChange={(v) => set('staff_audit_template', v)} templates={templates} disabled={!canManage} />
          </div>
        </div>
      </div>

      {/* Complaint early warning */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Complaint early warning</p>
            <p className="text-xs text-muted-foreground">Catches rising customer frustration across a thread before it becomes a bad review or a lost customer.</p>
          </div>
          <Toggle checked={settings.complaint_alert_enabled} onChange={() => set('complaint_alert_enabled', !settings.complaint_alert_enabled)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Template</Label>
          <TemplateSelect value={settings.complaint_alert_template} onChange={(v) => set('complaint_alert_template', v)} templates={templates} disabled={!canManage} />
        </div>
      </div>

      {/* Cash flow */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Cash flow warning</p>
            <p className="text-xs text-muted-foreground">Alerts you when unpaid invoices due soon add up to real money — so collecting them doesn&apos;t slip.</p>
          </div>
          <Toggle checked={settings.cashflow_alert_enabled} onChange={() => set('cashflow_alert_enabled', !settings.cashflow_alert_enabled)} disabled={!canManage} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Due within (days)</Label>
            <Input type="number" min={1} max={90} value={settings.cashflow_danger_days} onChange={(e) => set('cashflow_danger_days', Number(e.target.value))} disabled={!canManage} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <TemplateSelect value={settings.cashflow_alert_template} onChange={(v) => set('cashflow_alert_template', v)} templates={templates} disabled={!canManage} />
          </div>
        </div>
      </div>

      {/* No-show */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">No-show predictor</p>
            <p className="text-xs text-muted-foreground">Flags bookings likely to no-show (based on that contact&apos;s own history) inside the next 24h, so you can call and confirm.</p>
          </div>
          <Toggle checked={settings.noshow_alert_enabled} onChange={() => set('noshow_alert_enabled', !settings.noshow_alert_enabled)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Template</Label>
          <TemplateSelect value={settings.noshow_alert_template} onChange={(v) => set('noshow_alert_template', v)} templates={templates} disabled={!canManage} />
        </div>
      </div>

      {/* Price objection */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Silent price-objection catch</p>
            <p className="text-xs text-muted-foreground">When a lead goes quiet on price instead of saying so, AI drafts a capped discount/payment-plan offer and sends it to YOU — never to the customer. You decide whether to use it.</p>
          </div>
          <Toggle checked={settings.price_objection_enabled} onChange={() => set('price_objection_enabled', !settings.price_objection_enabled)} disabled={!canManage} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Max discount AI can suggest (%)</Label>
            <Input type="number" min={0} max={50} value={settings.price_objection_discount_cap} onChange={(e) => set('price_objection_discount_cap', Number(e.target.value))} disabled={!canManage} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <TemplateSelect value={settings.price_objection_template} onChange={(v) => set('price_objection_template', v)} templates={templates} disabled={!canManage} />
          </div>
        </div>
      </div>

      {/* Dialect detection */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Dialect detection</p>
            <p className="text-xs text-muted-foreground">Shows what language/dialect each customer actually writes in (Urdu, Arabic, Punjabi, mixed, etc) as a badge in the inbox — informational only, never auto-replies.</p>
          </div>
          <Toggle checked={settings.dialect_detection_enabled} onChange={() => set('dialect_detection_enabled', !settings.dialect_detection_enabled)} disabled={!canManage} />
        </div>
      </div>

      {canManage && (
        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Save
        </Button>
      )}
    </div>
  );
}
