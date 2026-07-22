'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, Trash2, Zap } from 'lucide-react';
import { AI_NAME, CLIENT_INDUSTRY, CLIENT_NAME, hasFeature } from '@/lib/features';

// ============================================================
// Scale OS — CEO Copilot. Full-page surface for the same
// /api/ai/assistant endpoint the header widget uses (shared
// localStorage thread, so a conversation started in the small
// popover picks up here and vice versa). This is the flagship
// entry point: ask a question, get an answer grounded in live
// data, or ask it to act (update_lead_status tool) and it does
// the work instead of just reporting on it.
// ============================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  error?: boolean;
}

const STORAGE_KEY = `${(CLIENT_NAME || 'scale_agency').toLowerCase().replace(/\s+/g, '_')}_ai_chat`;
const MAX_STORED = 40;

const RENTAL_INDUSTRY = (() => {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase();
  return ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel');
})();

const SUGGESTIONS = [
  ...(hasFeature('leads') && RENTAL_INDUSTRY
    ? ['Which equipment type gets requested most?', 'Which project sites are most active this month?']
    : hasFeature('leads')
    ? ['Which leads are hottest right now?', 'How many leads came in this week, and from where?']
    : []),
  ...(hasFeature('pipelines') ? ["What's my open pipeline worth by stage?", 'Mark my newest lead as called'] : []),
  ...(hasFeature('appointments') ? ['How many appointments are coming up?'] : []),
  ...(hasFeature('inbox') ? ['Summarize today’s WhatsApp conversations.'] : []),
].slice(0, 6);

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

function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[11px]">$1</code>')
    .replace(/\n/g, '<br/>');
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadStored());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // Storage full/blocked — chat still works, just won't persist.
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || loading) return;
      setInput('');
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
          { role: 'assistant', content: failed ? data.error || 'Something went wrong.' : data.answer, at: Date.now(), error: failed },
        ]);
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
    <div className="flex h-[calc(100vh-6.5rem)] flex-col space-y-4">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          <Zap className="h-3 w-3" />
          Scale OS
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-foreground">
          {AI_NAME} — CEO Copilot
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about your live business data, or tell it to act — it does the work, not just the reporting.
        </p>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-3xl bg-zinc-900 text-white shadow-elevated">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary opacity-[0.12] blur-[80px]" />

        <div ref={scrollRef} className="relative flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-8">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg space-y-2 py-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-2 text-sm text-white/60">Try asking:</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs text-white/70 transition-colors hover:border-primary/40 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed sm:max-w-[70%] ${
                  m.role === 'user'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : m.error
                      ? 'rounded-bl-sm border border-red-500/30 bg-red-500/10 text-red-300'
                      : 'rounded-bl-sm border border-white/10 bg-white/5 text-white/90'
                }`}
              >
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                <p className="mt-1 text-[10px] text-white/30">{formatTime(m.at)}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-4 py-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-white/60">Working…</span>
              </div>
            </div>
          )}
        </div>

        <div className="relative shrink-0 border-t border-white/10 p-4 sm:p-5">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask your business anything…"
              rows={1}
              disabled={loading}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-primary/50 disabled:opacity-60"
            />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear conversation"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => ask(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
