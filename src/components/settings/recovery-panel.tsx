'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SettingsPanelHead } from './settings-panel-head';
import { Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';

interface Settings {
  enabled: boolean;
  idle_days: number;
  template_name: string | null;
  template_language: string;
}

interface TemplateOption {
  name: string;
  language: string;
}

export function RecoveryPanel() {
  const canManage = useCan('edit-settings');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/recovery/settings')
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
    const res = await fetch('/api/recovery/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Save failed'); setSaving(false); return; }
    setSettings(json.settings);
    toast.success('Recovery settings saved');
    setSaving(false);
  }

  if (loading || !settings) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Lost-lead recovery"
        description="Automatically re-engage conversations that have gone quiet, before the lead is lost for good."
      />

      <div className="card-elevated p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable automatic recovery</p>
            <p className="text-xs text-muted-foreground">Sends your chosen template to conversations idle past the threshold below.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => canManage && setSettings((s) => s && { ...s, enabled: !s.enabled })}
            disabled={!canManage}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${settings.enabled ? 'bg-primary' : 'bg-muted'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Idle threshold (days)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={settings.idle_days}
              onChange={(e) => setSettings((s) => s && { ...s, idle_days: Number(e.target.value) })}
              disabled={!canManage}
              className="border-border bg-muted text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template to send</Label>
            <select
              value={settings.template_name ?? ''}
              onChange={(e) => setSettings((s) => s && { ...s, template_name: e.target.value || null })}
              disabled={!canManage}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground disabled:opacity-50"
            >
              <option value="">Select an approved template…</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No approved templates yet — submit one in Settings → Templates first. Meta requires an approved template to message a conversation that's gone quiet.</p>
            )}
          </div>
        </div>

        {canManage && (
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
