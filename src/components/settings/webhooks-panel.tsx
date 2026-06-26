'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from './settings-panel-head';
import { Trash2, Plus, Loader2, Copy, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const WEBHOOK_EVENTS = [
  { id: 'lead.created', label: 'Lead created' },
  { id: 'lead.updated', label: 'Lead updated' },
  { id: 'deal.created', label: 'Deal created' },
  { id: 'deal.won', label: 'Deal won' },
  { id: 'deal.lost', label: 'Deal lost' },
  { id: 'contact.created', label: 'Contact created' },
  { id: 'message.received', label: 'Message received' },
  { id: 'message.sent', label: 'Message sent' },
];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  last_triggered_at: string | null;
  last_status: number | null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return 'sk_' + Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function WebhooksPanel() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Webhook form
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState<string[]>([]);
  const [whSaving, setWhSaving] = useState(false);

  // API Key
  const [keyName, setKeyName] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const db = createClient();
    const [wh, ak] = await Promise.all([
      db.from('webhooks').select('*').order('created_at', { ascending: false }),
      db.from('api_keys').select('*').order('created_at', { ascending: false }),
    ]);
    setWebhooks((wh.data ?? []) as Webhook[]);
    setApiKeys((ak.data ?? []) as ApiKey[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!whUrl.trim() || whEvents.length === 0) { toast.error('URL and at least one event required'); return; }
    setWhSaving(true);
    const db = createClient();
    const { error } = await db.from('webhooks').insert({ name: whName.trim() || whUrl, url: whUrl.trim(), events: whEvents });
    setWhSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Webhook added');
    setWhName(''); setWhUrl(''); setWhEvents([]);
    load();
  }

  async function deleteWebhook(id: string) {
    const db = createClient();
    await db.from('webhooks').delete().eq('id', id);
    setWebhooks(w => w.filter(x => x.id !== id));
    toast.success('Webhook deleted');
  }

  async function createApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyName.trim()) return;
    setKeySaving(true);
    const key = generateApiKey();
    const hash = await hashKey(key);
    const db = createClient();
    const { error } = await db.from('api_keys').insert({ name: keyName.trim(), key_hash: hash, key_prefix: key.slice(0, 10) });
    setKeySaving(false);
    if (error) { toast.error(error.message); return; }
    setNewKey(key);
    setKeyName('');
    load();
  }

  async function revokeKey(id: string) {
    const db = createClient();
    await db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    load();
    toast.success('Key revoked');
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const toggleEvent = (ev: string) =>
    setWhEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);

  return (
    <div className="space-y-8">
      <SettingsPanelHead
        title="Webhooks & API"
        description="Send real-time events to your systems and authenticate external API calls."
      />

      {/* API Keys */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground">API Keys</p>

        {newKey && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-primary">Save this key — it won't be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs font-mono text-foreground break-all">{newKey}</code>
              <Button type="button" size="icon-xs" variant="outline" onClick={copyKey} className="shrink-0 border-border">
                {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={() => setNewKey(null)}>Dismiss</Button>
          </div>
        )}

        <form onSubmit={createApiKey} className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Key name</Label>
            <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="e.g. Shopify Integration" className="border-border bg-muted text-foreground" />
          </div>
          <Button type="submit" disabled={keySaving || !keyName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">
            {keySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1.5" />Create Key</>}
          </Button>
        </form>

        {!loading && apiKeys.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {apiKeys.map(k => (
              <div key={k.id} className="flex items-center gap-4 px-4 py-3 bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</p>
                </div>
                {k.revoked_at ? (
                  <span className="text-xs text-red-400 font-medium">Revoked</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => revokeKey(k.id)} className="shrink-0 text-muted-foreground hover:text-red-400 text-xs">
                    <RefreshCw className="h-3 w-3 mr-1" />Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhooks */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground">Webhooks</p>

        <form onSubmit={addWebhook} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name (optional)</Label>
              <Input value={whName} onChange={e => setWhName(e.target.value)} placeholder="My CRM sync" className="border-border bg-muted text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input value={whUrl} onChange={e => setWhUrl(e.target.value)} placeholder="https://your-server.com/webhook" type="url" required className="border-border bg-muted text-foreground" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Events to send</Label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map(ev => (
                <button key={ev.id} type="button" onClick={() => toggleEvent(ev.id)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    whEvents.includes(ev.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >{ev.label}</button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={whSaving || !whUrl.trim() || whEvents.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {whSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Webhook
          </Button>
        </form>

        {!loading && webhooks.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {webhooks.map(w => (
              <div key={w.id} className="flex items-start gap-4 px-4 py-3 bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{w.name || w.url}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{w.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {w.events.map(ev => (
                      <span key={ev} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{ev}</span>
                    ))}
                  </div>
                </div>
                {w.last_status && (
                  <span className={cn('text-xs font-mono', w.last_status >= 200 && w.last_status < 300 ? 'text-green-400' : 'text-red-400')}>{w.last_status}</span>
                )}
                <Button variant="ghost" size="icon-xs" onClick={() => deleteWebhook(w.id)} className="shrink-0 text-muted-foreground hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
