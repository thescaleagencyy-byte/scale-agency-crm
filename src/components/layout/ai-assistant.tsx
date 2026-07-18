'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, Trash2, X } from 'lucide-react';
import { AI_NAME, CLIENT_INDUSTRY, CLIENT_NAME, hasFeature } from '@/lib/features';

// ============================================================
// Client AI — floating chat widget in the header.
//
// Sparkles button opens a panel where any signed-in user can ask
// ad-hoc questions about live business data (leads, pipeline,
// appointments, conversations). Backed by /api/ai/assistant, which
// injects an RLS-scoped data snapshot into the model prompt.
// Thread persists in localStorage so the conversation survives
// navigation and reloads.
// ============================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  error?: boolean;
}

// Branded per deployment — "AshWheelz AI" on the AshWheelz deploy,
// "Sultan Yakhni Pulao AI" on Sultan's, "Scale Agency AI" on ours.
// (AI_NAME itself now lives in @/lib/features so settings copy that
// references it can't drift out of sync — see ai-config-panel.tsx.)
const STORAGE_KEY = `${(CLIENT_NAME || 'scale_agency').toLowerCase().replace(/\s+/g, '_')}_ai_chat`;
const MAX_STORED = 40;

const RENTAL_INDUSTRY = (() => {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase();
  return ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel');
})();

// Only suggest questions about surfaces this deployment actually has —
// a gated-off feature would make the AI answer about data the user
// can't open anywhere in the UI. Rental deployments get equipment/site
// prompts instead of generic pipeline language that doesn't apply.
const SUGGESTIONS = [
  ...(hasFeature('leads') && RENTAL_INDUSTRY
    ? ['Which equipment type gets requested most?', 'Which project sites are most active this month?', 'How many quotes went out this week, and how many turned into rentals?']
    : hasFeature('leads')
    ? ['Which leads are hottest right now?', 'How many leads came in this week, and from where?']
    : []),
  ...(hasFeature('pipelines') ? ["What's my open pipeline worth by stage?"] : []),
  ...(hasFeature('appointments') ? ['How many appointments are coming up?'] : []),
  ...(hasFeature('inbox') ? ['Summarize today’s WhatsApp conversations.'] : []),
].slice(0, 4);

function loadStored(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_STORED) : [];
  } catch {
    return [];
  }
}

// Minimal markdown: escape HTML, then render **bold** and `code`.
// The model is instructed to reply in plain bullets, so this covers
// everything it actually emits without pulling in a parser.
function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[11px]">$1</code>')
    .replace(/\n/g, '<br/>');
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Hydrate the thread once on mount (localStorage is client-only).
  useEffect(() => {
    setMessages(loadStored());
  }, []);

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // Storage full/blocked — chat still works, just won't persist.
    }
  }, [messages]);

  // Outside click closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) {
      setUnread(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || loading) return;
      setInput('');
      // History = thread as it stood before this question.
      const history = messages
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { role: 'user', content: question, at: Date.now() }]);
      setLoading(true);
      try {
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, history }),
        });
        const data = await res.json();
        const failed = !res.ok || !!data.error;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: failed ? data.error || 'Something went wrong.' : data.answer,
            at: Date.now(),
            error: failed,
          },
        ]);
        if (!openRef.current) setUnread(true);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Network error. Try again.', at: Date.now(), error: true },
        ]);
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [loading, messages],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  const clear = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Open ${AI_NAME}`}
        aria-expanded={open}
        className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-muted ${
          open ? 'bg-muted text-primary' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Sparkles className="h-5 w-5" />
        {unread && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 flex max-h-[560px] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
          {/* Head */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold leading-tight">{AI_NAME}</p>
                <p className="text-[11px] text-muted-foreground">
                  Ask about your live business data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Clear conversation"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Thread */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-2 py-2">
                <p className="text-xs text-muted-foreground">Try asking:</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="block w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary/15 text-foreground'
                      : m.error
                        ? 'rounded-bl-sm border border-destructive/30 bg-destructive/10 text-destructive'
                        : 'rounded-bl-sm border border-border bg-muted/50 text-foreground'
                  }`}
                >
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  <p className="mt-1 text-[10px] text-muted-foreground/70">{formatTime(m.at)}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl rounded-bl-sm border border-border bg-muted/50 px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Analyzing…</span>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about your business…"
                rows={1}
                disabled={loading}
                className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => ask(input)}
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
              Powered by <span className="font-semibold text-muted-foreground/80">The Scale Agency</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
