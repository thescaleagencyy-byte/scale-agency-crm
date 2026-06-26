'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Lead, LeadNote } from '@/types';

interface Props {
  lead: Lead;
  onClose: () => void;
}

export function LeadNotesPanel({ lead, onClose }: Props) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('lead_notes')
      .select('*, author:profiles(full_name, avatar_url)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error(error.message);
        else setNotes((data ?? []) as LeadNote[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lead.id]);

  async function addNote() {
    if (!text.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not signed in'); setSaving(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    const { data, error } = await supabase
      .from('lead_notes')
      .insert({ lead_id: lead.id, account_id: profile?.account_id, user_id: user.id, note_text: text.trim() })
      .select('*, author:profiles(full_name, avatar_url)')
      .single();

    if (error) toast.error('Failed to add note');
    else {
      setNotes(prev => [data as LeadNote, ...prev]);
      setText('');
      toast.success('Note added');
    }
    setSaving(false);
  }

  async function deleteNote(id: string) {
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from('lead_notes').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else setNotes(prev => prev.filter(n => n.id !== id));
    setDeleting(null);
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="bg-popover border-border text-popover-foreground sm:max-w-md w-full p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              Notes — {lead.customer_name ?? lead.customer_phone}
            </SheetTitle>
          </SheetHeader>

          <div className="p-4 border-b border-border/50 space-y-2">
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Add a note..."
              className="min-h-[80px] border-border bg-muted text-foreground resize-none"
            />
            <Button
              onClick={addNote}
              disabled={saving || !text.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Note'}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No notes yet</p>
            ) : (
              notes.map(note => (
                <div key={note.id} className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {note.author?.full_name ?? 'Unknown'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        {deleting === note.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
