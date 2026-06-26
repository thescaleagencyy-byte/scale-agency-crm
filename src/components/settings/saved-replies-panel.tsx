'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SettingsPanelHead } from './settings-panel-head';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SavedReply {
  id: string;
  title: string;
  shortcut: string;
  body: string;
}

export function SavedRepliesPanel() {
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const db = createClient();
    const { data } = await db.from('saved_replies').select('*').order('shortcut');
    setReplies((data ?? []) as SavedReply[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !shortcut.trim() || !body.trim()) return;
    setSaving(true);
    const db = createClient();
    const clean = shortcut.replace(/^\//, '').toLowerCase().replace(/\s+/g, '_');
    const { error } = await db.from('saved_replies').insert({ title: title.trim(), shortcut: clean, body: body.trim() });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved reply added');
    setTitle(''); setShortcut(''); setBody('');
    load();
  }

  async function handleDelete(id: string) {
    const db = createClient();
    await db.from('saved_replies').delete().eq('id', id);
    setReplies(r => r.filter(x => x.id !== id));
    toast.success('Deleted');
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Saved Replies"
        description="Canned responses your team can insert with / in the message composer."
      />

      <form onSubmit={handleAdd} className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Add new reply</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Price inquiry" className="border-border bg-muted text-foreground" required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Shortcut (type after /)</Label>
            <Input value={shortcut} onChange={e => setShortcut(e.target.value)} placeholder="price" className="border-border bg-muted text-foreground font-mono" required />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Message body</Label>
          <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Our pricing depends on your project requirements. Let me get you a quote..." rows={3} className="border-border bg-muted text-foreground resize-none" required />
        </div>
        <Button type="submit" disabled={saving || !title.trim() || !shortcut.trim() || !body.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Add Reply
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Your saved replies ({replies.length})</p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : replies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No saved replies yet. Add one above.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {replies.map(r => (
              <div key={r.id} className="flex items-start gap-4 px-4 py-3 bg-card">
                <span className="mt-0.5 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-semibold text-primary">/{r.shortcut}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.body}</p>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(r.id)} className="shrink-0 text-muted-foreground hover:text-red-400">
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
