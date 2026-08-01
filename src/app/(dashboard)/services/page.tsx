'use client';

// ============================================================
// Services — the client's rental catalog with availability
// toggles, grouped by category. Same idea as a restaurant
// dashboard's menu-item availability: flip a service off and
// the WhatsApp bot (via /api/n8n/services) stops offering it.
//
// Read for every member; toggling / adding / deleting is
// admin+ only (RLS enforces this server-side too).
// ============================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Plus, Wrench, Trash2, X } from 'lucide-react';

interface ServiceRow {
  id: string;
  category: string;
  name: string;
  spec: string | null;
  available: boolean;
  sort_order: number;
}

export default function ServicesPage() {
  const { accountId, canManageMembers } = useAuth();
  const canEdit = canManageMembers; // admin+ (owner & support team)

  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');

  async function load() {
    const db = createClient();
    const { data, error } = await db
      .from('client_services')
      .select('id, category, name, spec, available, sort_order')
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as ServiceRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggle(row: ServiceRow) {
    // Optimistic flip; revert on error so the UI never lies.
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, available: !r.available } : r)));
    const db = createClient();
    const { error } = await db
      .from('client_services')
      .update({ available: !row.available })
      .eq('id', row.id);
    if (error) {
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, available: row.available } : r)));
      toast.error(error.message);
      return;
    }
    toast.success(`${row.name} marked ${!row.available ? 'available' : 'unavailable'}`);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) { toast.error('Account not loaded'); return; }
    setSaving(true);
    const db = createClient();
    const maxSort = rows
      .filter(r => r.category.toLowerCase() === category.trim().toLowerCase())
      .reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await db.from('client_services').insert({
      account_id: accountId,
      category: category.trim(),
      name: name.trim(),
      spec: spec.trim() || null,
      sort_order: maxSort + 1,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Service added');
    setCategory(''); setName(''); setSpec('');
    setShowForm(false);
    load();
  }

  async function del(row: ServiceRow) {
    const db = createClient();
    const { error } = await db.from('client_services').delete().eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.filter(r => r.id !== row.id));
    toast.success('Service removed');
  }

  const categories = [...new Set(rows.map(r => r.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your rental catalog. Switch a service off and the WhatsApp assistant stops offering it.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />Add service
          </Button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Add service</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={add} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Truck Rentals" list="svc-categories" required className="border-border bg-muted text-foreground" />
                <datalist id="svc-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Service name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lowbed Trailer" required className="border-border bg-muted text-foreground" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Spec / range (optional)</Label>
                <Input value={spec} onChange={e => setSpec(e.target.value)} placeholder="e.g. 25 to 250 tons, hydraulic & extendable" className="border-border bg-muted text-foreground" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 border-border bg-transparent text-muted-foreground">Cancel</Button>
                <Button type="submit" disabled={saving || !category.trim() || !name.trim()} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Add
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-16">
          <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No services yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canEdit ? 'Add your first rental service to get started' : 'An admin can add services here'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => (
            <section key={cat} className="rounded-2xl border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">{cat}</h2>
                <span className="text-xs text-muted-foreground">
                  {rows.filter(r => r.category === cat && r.available).length}/{rows.filter(r => r.category === cat).length} available
                </span>
              </header>
              <ul className="divide-y divide-border">
                {rows.filter(r => r.category === cat).map(row => (
                  <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${row.available ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                        {row.name}
                      </p>
                      {row.spec && <p className="text-xs text-muted-foreground truncate">{row.spec}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${row.available ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                      {row.available ? 'Available' : 'Unavailable'}
                    </span>
                    {canEdit && (
                      <>
                        <Switch checked={row.available} onCheckedChange={() => toggle(row)} aria-label={`Toggle ${row.name}`} />
                        <button onClick={() => del(row)} title="Delete" className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-muted">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
