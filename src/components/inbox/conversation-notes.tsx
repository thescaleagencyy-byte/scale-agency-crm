'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Loader2, Send, StickyNote, AtSign, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Note {
  id: string;
  content: string;
  mentions: string[];
  created_at: string;
  author_id: string;
  author_name?: string;
}

interface TeamMember {
  user_id: string;
  full_name: string | null;
}

interface ConversationNotesProps {
  conversationId: string;
  accountId: string;
}

export function ConversationNotes({ conversationId, accountId }: ConversationNotesProps) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    const db = createClient();
    const { data: notesData } = await db
      .from('conversation_notes')
      .select('*, author:profiles(full_name)')
      .eq('conversation_id', conversationId)
      .order('created_at');

    const { data: membersData } = await db
      .from('profiles')
      .select('user_id, full_name')
      .eq('account_id', accountId)
      .limit(50);

    const mapped = (notesData ?? []).map((n: Record<string, unknown>) => ({
      id: n.id as string,
      content: n.content as string,
      mentions: n.mentions as string[],
      created_at: n.created_at as string,
      author_id: n.author_id as string,
      author_name: (n.author as { full_name?: string } | null)?.full_name ?? 'Unknown',
    }));
    setNotes(mapped);
    setMembers((membersData ?? []) as TeamMember[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [conversationId]);

  const filteredMembers = mentionQuery
    ? members.filter(m => m.full_name?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : members;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionOpen(true);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
      setMentionQuery('');
    }
  }

  function insertMention(member: TeamMember) {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const newBefore = before.replace(/@\w*$/, `@${member.full_name ?? member.user_id} `);
    setText(newBefore + after);
    setMentionOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filteredMembers.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMembers[mentionIdx]); return; }
      if (e.key === 'Escape') { setMentionOpen(false); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendNote();
    }
  }

  function extractMentionedIds(): string[] {
    const ids: string[] = [];
    for (const m of members) {
      if (m.full_name && text.includes(`@${m.full_name}`)) ids.push(m.user_id);
    }
    return ids;
  }

  async function sendNote() {
    if (!text.trim() || sending) return;
    setSending(true);
    const db = createClient();
    const mentions = extractMentionedIds();
    const { error } = await db.from('conversation_notes').insert({
      conversation_id: conversationId,
      account_id: accountId,
      content: text.trim(),
      mentions,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setText('');
    load();
  }

  async function deleteNote(id: string) {
    const db = createClient();
    await db.from('conversation_notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <StickyNote className="h-3.5 w-3.5 text-primary" />
        Internal Notes
        <span className="ml-auto text-muted-foreground font-normal">Visible to team only</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : notes.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No notes yet. Add one below.</p>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
          {notes.map(n => {
            const isOwn = n.author_id === profile?.id;
            return (
              <div key={n.id} className="group relative rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-amber-400">{isOwn ? 'You' : (n.author_name ?? 'Team')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{format(new Date(n.created_at), 'MMM d, h:mm a')}</span>
                    {isOwn && (
                      <button
                        onClick={() => deleteNote(n.id)}
                        className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{renderMentions(n.content)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mt-auto shrink-0">
        {mentionOpen && filteredMembers.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 right-0 rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-10">
            {filteredMembers.map((m, i) => (
              <button
                key={m.user_id}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm text-left',
                  i === mentionIdx ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                )}
                onMouseDown={e => { e.preventDefault(); insertMention(m); }}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {(m.full_name ?? '?').charAt(0).toUpperCase()}
                </div>
                {m.full_name ?? m.user_id}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="relative flex-1">
            <AtSign className="absolute left-3 top-2.5 h-3 w-3 text-muted-foreground pointer-events-none" />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Add a note… Type @ to mention a teammate. ⌘+Enter to send."
              rows={2}
              className="w-full resize-none rounded-xl border border-amber-500/30 bg-amber-500/5 pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
          </div>
          <button
            onClick={sendNote}
            disabled={!text.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function renderMentions(text: string) {
  const parts = text.split(/(@\w[\w\s]*)/g);
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <span key={i} className="font-semibold text-amber-400">{p}</span>
    ) : p
  );
}
