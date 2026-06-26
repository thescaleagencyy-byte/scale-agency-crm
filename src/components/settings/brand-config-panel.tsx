'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from './settings-panel-head';
import { Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';

interface BrandConfig {
  app_name: string | null;
  logo_url: string | null;
  primary_hex: string | null;
  support_email: string | null;
}

export function BrandConfigPanel() {
  const [config, setConfig] = useState<BrandConfig>({ app_name: '', logo_url: '', primary_hex: '', support_email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/brand').then(r => r.json()).then(data => {
      if (data) setConfig(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? 'Save failed'); setSaving(false); return; }
    toast.success('Branding saved');
    // Apply primary color immediately if set
    if (config.primary_hex) {
      document.documentElement.style.setProperty('--primary-custom', config.primary_hex);
    }
    setSaving(false);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Branding"
        description="Customise the name, logo, and accent color shown to your team. Useful when reselling this CRM to clients under your own brand."
      />

      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">App / workspace name</Label>
            <Input
              value={config.app_name ?? ''}
              onChange={e => setConfig(c => ({ ...c, app_name: e.target.value }))}
              placeholder="e.g. Acme CRM"
              className="border-border bg-muted text-foreground"
            />
            <p className="text-[10px] text-muted-foreground">Shown in sidebar header instead of default name.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Support email</Label>
            <Input
              type="email"
              value={config.support_email ?? ''}
              onChange={e => setConfig(c => ({ ...c, support_email: e.target.value }))}
              placeholder="support@yourcompany.com"
              className="border-border bg-muted text-foreground"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Logo URL</Label>
          <Input
            value={config.logo_url ?? ''}
            onChange={e => setConfig(c => ({ ...c, logo_url: e.target.value }))}
            placeholder="https://yourcdn.com/logo.png (square, min 64×64)"
            className="border-border bg-muted text-foreground"
          />
          <div className="flex items-center gap-3 mt-2">
            {config.logo_url && (
              <img src={config.logo_url} alt="Logo preview" className="h-10 w-10 rounded-lg object-cover border border-border" />
            )}
            <p className="text-[10px] text-muted-foreground">Host your logo on Supabase Storage or any public CDN. Replaces the sidebar avatar.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />Accent color (hex)
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={config.primary_hex || '#7c3aed'}
              onChange={e => setConfig(c => ({ ...c, primary_hex: e.target.value }))}
              className="h-10 w-14 rounded-lg border border-border bg-muted cursor-pointer p-1"
            />
            <Input
              value={config.primary_hex ?? ''}
              onChange={e => setConfig(c => ({ ...c, primary_hex: e.target.value }))}
              placeholder="#7c3aed"
              className="border-border bg-muted text-foreground font-mono w-36"
              maxLength={7}
            />
            <div
              className="h-10 w-10 rounded-lg border border-border shrink-0"
              style={{ backgroundColor: config.primary_hex || '#7c3aed' }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">Buttons, badges, and active states. Applied instantly on save.</p>
        </div>

        <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save branding
        </Button>
      </form>
    </div>
  );
}
