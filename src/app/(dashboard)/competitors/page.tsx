'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Radar, Plus, Trash2, X, RefreshCw } from 'lucide-react';

interface CompetitorRow {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  last_summary: string | null;
  last_checked_at: string | null;
}

export default function CompetitorsPage() {
  const [rows, setRows] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const { data, error } = await supabase
      .from('competitors')
      .select('id, name, url, notes, last_summary, last_checked_at')
      .order('name');
    if (error) toast.error(error.message);
    else setRows((data as CompetitorRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!name.trim() || !url.trim()) {
      toast.error('Name and URL required.');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: profile } = await supabase.from('profiles').select('account_id').maybeSingle();
    const { error } = await supabase.from('competitors').insert({
      account_id: profile?.account_id,
      name: name.trim(),
      url: url.trim(),
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Competitor added.');
      setName(''); setUrl(''); setNotes(''); setAdding(false);
      load();
    }
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('competitors').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Removed'); setRows((prev) => prev.filter((r) => r.id !== id)); }
  }

  async function analyze(id: string) {
    setAnalyzingId(id);
    try {
      const res = await fetch('/api/competitors/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId: id }),
      });
      const data = await res.json();
      if (data.summary) {
        toast.success('Analysis updated.');
        load();
      } else {
        toast.error(data.error || 'Analysis failed.');
      }
    } catch {
      toast.error('Network error running analysis.');
    } finally {
      setAnalyzingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitor Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track competitors you care about. &quot;Analyze now&quot; scrapes their site and summarizes pricing, offers, and positioning — needs a Firecrawl key configured for this deployment.
          </p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add competitor
          </Button>
        )}
      </div>

      {adding && (
        <div className="card-elevated p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">New competitor</p>
            <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Input placeholder="Name (e.g. 'Rival Rentals KSA')" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="URL (e.g. https://rival.com)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </div>
      )}

      <div className="panel-float overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Radar className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No competitors tracked yet</p>
            <p className="text-xs text-muted-foreground">Add one to start tracking their pricing and offers</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{r.name}</p>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">
                      {r.url}
                    </a>
                  </div>
                  {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                  {r.last_summary ? (
                    <div className="mt-2 whitespace-pre-line rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                      {r.last_summary}
                    </div>
                  ) : null}
                  {r.last_checked_at && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Last checked {new Date(r.last_checked_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => analyze(r.id)}
                    disabled={analyzingId === r.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                  >
                    {analyzingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Analyze now
                  </button>
                  <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
