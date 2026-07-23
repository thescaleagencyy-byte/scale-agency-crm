'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Brain, Plus, Trash2, X, Sparkles } from 'lucide-react';

interface KnowledgeRow {
  id: string;
  category: string;
  title: string;
  content: string;
  created_at: string;
}

const CATEGORIES = ['pricing', 'sop', 'policy', 'tone', 'products', 'team', 'goals', 'general'] as const;
const CATEGORY_LABEL: Record<string, string> = {
  pricing: 'Pricing', sop: 'SOP', policy: 'Policy', tone: 'Tone', products: 'Products', team: 'Team', goals: 'Goals', general: 'General', insight: 'Insight',
};

export default function BusinessKnowledgePage() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<string>('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const { data, error } = await supabase
      .from('business_knowledge')
      .select('id, category, title, content, created_at')
      .order('category');
    if (error) toast.error(error.message);
    else setRows((data as KnowledgeRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content required.');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: profile } = await supabase.from('profiles').select('account_id').maybeSingle();
    const { error } = await supabase.from('business_knowledge').insert({
      account_id: profile?.account_id,
      category,
      title: title.trim(),
      content: content.trim(),
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Added — the Copilot will use this from now on.');
      setTitle(''); setContent(''); setCategory('general'); setAdding(false);
      load();
    }
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('business_knowledge').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Removed'); setRows((prev) => prev.filter((r) => r.id !== id)); }
  }

  async function generateInsights() {
    setGenerating(true);
    try {
      const res = await fetch('/api/insights/generate', { method: 'POST' });
      const data = await res.json();
      if (typeof data.created === 'number') {
        toast.success(data.created > 0 ? `Calculated ${data.created} insight(s) from your lead data.` : (data.message || 'Nothing to calculate yet.'));
        if (data.created > 0) load();
      } else {
        toast.error(data.error || 'Failed to generate insights.');
      }
    } catch {
      toast.error('Network error generating insights.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Business Knowledge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Permanent facts the Copilot reads before every answer — pricing, SOPs, refund policy, tone, whatever it should always know.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={generateInsights} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Calculate insights
          </Button>
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add fact
            </Button>
          )}
        </div>
      </div>

      {adding && (
        <div className="card-elevated p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">New fact</p>
            <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${category === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <Input placeholder="Title (e.g. 'Refund policy')" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Content — write it exactly how you'd want it explained to a customer." value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
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
            <Brain className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No facts saved yet</p>
            <p className="text-xs text-muted-foreground">The Copilot only knows your live CRM data until you add some</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                    <p className="text-sm font-medium text-foreground">{r.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.content}</p>
                </div>
                <button onClick={() => remove(r.id)} className="shrink-0 text-muted-foreground hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
