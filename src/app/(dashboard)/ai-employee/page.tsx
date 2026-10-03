'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, Plus, Trash2, X, Pencil } from 'lucide-react';

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: string | null;
  available: boolean;
}

interface BotOrder {
  id: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  currency: string;
  status: string;
  created_at: string;
  contact_id: string | null;
}

interface Config {
  enabled: boolean;
  business_type: string;
  greeting_message: string | null;
  policies: string | null;
}

const BUSINESS_TYPES = ['restaurant', 'clinic', 'retail', 'services', 'general'] as const;

export default function AIEmployeePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<BotOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [configRes, itemsRes, ordersRes] = await Promise.all([
      fetch('/api/ai-employee/config').then((r) => r.json()),
      supabase.from('catalog_items').select('id, name, description, price, currency, category, available').order('category'),
      supabase.from('bot_orders').select('id, items, total, currency, status, created_at, contact_id').order('created_at', { ascending: false }).limit(20),
    ]);
    setConfig(configRes.config);
    setItems((itemsRes.data as CatalogItem[]) ?? []);
    setOrders((ordersRes.data as BotOrder[]) ?? []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- identical shape to business-knowledge/page.tsx's load(), which lints clean; false positive here
  useEffect(() => { load(); }, [load]);

  async function saveConfig() {
    if (!config) return;
    setSavingConfig(true);
    const res = await fetch('/api/ai-employee/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? 'Save failed'); setSavingConfig(false); return; }
    setConfig(json.config);
    toast.success('AI Employee settings saved');
    setSavingConfig(false);
  }

  function startAdd() {
    setEditingId(null); setName(''); setDescription(''); setPrice(''); setCategory(''); setAdding(true);
  }
  function startEdit(item: CatalogItem) {
    setEditingId(item.id); setName(item.name); setDescription(item.description ?? ''); setPrice(String(item.price)); setCategory(item.category ?? ''); setAdding(true);
  }

  async function saveItem() {
    if (!name.trim() || !price.trim() || isNaN(Number(price))) {
      toast.error('Name and a valid price are required.');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: profile } = await supabase.from('profiles').select('account_id').maybeSingle();
    const row = {
      account_id: profile?.account_id,
      name: name.trim(),
      description: description.trim() || null,
      price: Number(price),
      category: category.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from('catalog_items').update(row).eq('id', editingId)
      : await supabase.from('catalog_items').insert(row);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(editingId ? 'Updated' : 'Added');
      setAdding(false); setEditingId(null);
      load();
    }
  }

  async function toggleAvailable(item: CatalogItem) {
    const supabase = createClient();
    const { error } = await supabase.from('catalog_items').update({ available: !item.available }).eq('id', item.id);
    if (error) toast.error(error.message);
    else setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: !i.available } : i)));
  }

  async function removeItem(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('catalog_items').delete().eq('id', id);
    if (error) toast.error(error.message);
    else setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading || !config) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> AI Employee</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your own AI agent that answers questions, takes orders/bookings, and confirms them — built from the catalog below. Escalates to a human for anything it can&apos;t handle.
        </p>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable AI Employee</p>
            <p className="text-xs text-muted-foreground">Turns on for every new WhatsApp message. Test with your own number first before relying on it for real customers.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            onClick={() => setConfig((c) => c && { ...c, enabled: !c.enabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${config.enabled ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Business type</Label>
          <div className="flex flex-wrap gap-1.5">
            {BUSINESS_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setConfig((c) => c && { ...c, business_type: t })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${config.business_type === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Greeting style</Label>
            <Textarea placeholder="e.g. warm and casual, use first names" value={config.greeting_message ?? ''} onChange={(e) => setConfig((c) => c && { ...c, greeting_message: e.target.value })} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Policies (delivery, refunds, hours, etc)</Label>
            <Textarea placeholder="e.g. delivery takes 30-45 min, no refunds after pickup" value={config.policies ?? ''} onChange={(e) => setConfig((c) => c && { ...c, policies: e.target.value })} rows={2} />
          </div>
        </div>

        <Button onClick={saveConfig} disabled={savingConfig} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {savingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Catalog</h2>
        {!adding && <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1" />Add item</Button>}
      </div>

      {adding && (
        <div className="card-elevated p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{editingId ? 'Edit item' : 'New item'}</p>
            <button onClick={() => { setAdding(false); setEditingId(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Name (e.g. 'Zinger Burger')" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:col-span-2" />
            <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="sm:col-span-2" />
          </div>
          <Button onClick={saveItem} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save</Button>
        </div>
      )}

      <div className="panel-float overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Bot className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No catalog items yet</p>
            <p className="text-xs text-muted-foreground">The AI Employee needs at least one item/service to sell from</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <span className="text-xs text-muted-foreground">{item.currency} {item.price}</span>
                    {!item.available && <Badge variant="outline" className="text-xs text-muted-foreground">Unavailable</Badge>}
                  </div>
                  {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => toggleAvailable(item)} className="text-xs text-muted-foreground hover:text-foreground underline">
                    {item.available ? 'Mark unavailable' : 'Mark available'}
                  </button>
                  <button onClick={() => startEdit(item)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-foreground">Recent orders</h2>
      <div className="panel-float overflow-hidden">
        {orders.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">No orders confirmed by the AI Employee yet</div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((o) => (
              <div key={o.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{o.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                </div>
                <p className="text-sm font-semibold text-foreground shrink-0">{o.currency} {o.total}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
