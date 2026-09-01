'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachProspect } from '@/types';

const STATUS_CLASS: Record<string, string> = {
  active:       'bg-green-500/15 text-green-600 border-green-500/30',
  unsubscribed: 'bg-muted text-muted-foreground border-border',
  bounced:      'bg-red-500/15 text-red-600 border-red-500/30',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OutreachProspectsPage() {
  const router = useRouter();
  const [prospects, setProspects] = useState<OutreachProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from('outreach_prospects').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    else setProspects((data ?? []) as OutreachProspect[]);
    setLoading(false);
  }, []);

  // Same fetch-on-mount shape already used in leads/page.tsx; setState
  // only happens after the awaited Supabase call resolves, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function importPasted() {
    const lines = pasted.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) { toast.error('Paste at least one line: email,name,company'); return; }

    const rows: { email: string; name: string | null; company: string | null }[] = [];
    const invalid: string[] = [];
    for (const line of lines) {
      const [emailRaw, nameRaw, companyRaw] = line.split(',').map(p => p?.trim());
      const email = emailRaw?.toLowerCase();
      if (!email || !EMAIL_RE.test(email)) { invalid.push(line); continue; }
      rows.push({ email, name: nameRaw || null, company: companyRaw || null });
    }
    if (invalid.length) toast.error(`Skipped ${invalid.length} invalid line${invalid.length === 1 ? '' : 's'} (bad email)`);
    if (!rows.length) return;

    setImporting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not signed in'); setImporting(false); return; }
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();

    const { error } = await supabase.from('outreach_prospects').upsert(
      rows.map(r => ({ ...r, account_id: profile?.account_id, source: 'manual', status: 'active' })),
      { onConflict: 'account_id,email', ignoreDuplicates: true },
    );
    setImporting(false);
    if (error) { toast.error('Import failed: ' + error.message); return; }
    toast.success(`Added ${rows.length} prospect${rows.length === 1 ? '' : 's'}`);
    setPasted('');
    setPasteOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/outreach')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Prospects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">People to cold-email — separate from your WhatsApp leads/contacts</p>
        </div>
        <Button onClick={() => setPasteOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Prospects
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : prospects.length === 0 ? (
        <div className="flex flex-col items-center justify-center card-elevated py-16 gap-3">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No prospects yet</p>
          <p className="text-xs text-muted-foreground">Paste a list of emails to get started</p>
          <Button onClick={() => setPasteOpen(true)} className="mt-2 bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Add Prospects
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left text-xs text-muted-foreground px-4 py-2">Email</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-2">Name</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-2">Company</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{p.email}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.name ?? '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.company ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`text-xs capitalize ${STATUS_CLASS[p.status]}`}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPasteOpen(false)}>
          <div className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Add Prospects</h2>
              <p className="text-xs text-muted-foreground mt-1">One per line: <code>email,name,company</code> — name and company are optional.</p>
            </div>
            <div className="p-4">
              <Textarea
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                placeholder={'owner@restaurant.com,Ali,Ali\'s Kitchen\ninfo@shop.com'}
                className="border-border bg-muted text-foreground min-h-[180px] font-mono text-xs"
              />
            </div>
            <div className="p-4 border-t border-border flex gap-2">
              <Button variant="outline" onClick={() => setPasteOpen(false)} className="flex-1 border-border bg-transparent text-muted-foreground">Cancel</Button>
              <Button onClick={importPasted} disabled={importing} className="flex-1 bg-primary text-primary-foreground">
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Import
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
