'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, RefreshCw, Check, X } from 'lucide-react';

interface AgentAction {
  id: string;
  reason: string;
  drafted_text: string;
  lead: { customer_name: string | null; customer_phone: string } | { customer_name: string | null; customer_phone: string }[] | null;
}

// Daily Agent's draft-and-approve queue — chosen over full
// auto-send: the agent drafts a WhatsApp follow-up per cold lead,
// nothing goes to a real customer until a human approves this exact
// message. Rejecting just discards the draft; approving sends it for
// real via the same Meta path the rest of the app uses.
export function AgentQueueCard() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/actions');
      const data = await res.json();
      if (data.actions) setActions(data.actions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/agent/generate-actions', { method: 'POST' });
      const data = await res.json();
      if (typeof data.created === 'number') {
        toast.success(data.created > 0 ? `Drafted ${data.created} follow-up(s) for review.` : (data.message || 'Nothing to draft right now.'));
        if (data.created > 0) load();
      } else {
        toast.error(data.error || 'Failed to scan for cold leads.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setGenerating(false);
    }
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agent/actions/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        toast.success('Sent.');
        setActions((prev) => prev.filter((a) => a.id !== id));
      } else {
        toast.error(data.error || 'Send failed.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agent/actions/${id}/reject`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) setActions((prev) => prev.filter((a) => a.id !== id));
      else toast.error(data.error || 'Failed to reject.');
    } finally {
      setBusyId(null);
    }
  };

  const oneContact = (l: AgentAction['lead']) => (Array.isArray(l) ? l[0] ?? null : l);

  return (
    <div className="panel-float overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Agent Queue</p>
            <p className="text-xs text-muted-foreground">Drafted follow-ups for cold leads — review before anything sends.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Scan for cold leads
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading queue...</span>
        </div>
      ) : actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 py-10">
          <p className="text-sm font-medium text-foreground">Queue is empty</p>
          <p className="text-xs text-muted-foreground">Click &quot;Scan for cold leads&quot; to draft follow-ups</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {actions.map((a) => {
            const contact = oneContact(a.lead);
            return (
              <div key={a.id} className="px-5 py-3.5">
                <p className="text-xs font-medium text-foreground">{contact?.customer_name ?? contact?.customer_phone ?? 'Unknown lead'}</p>
                <p className="text-[11px] text-muted-foreground">{a.reason}</p>
                <p className="mt-1.5 rounded-lg bg-muted/50 p-2.5 text-xs text-foreground">{a.drafted_text}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={() => approve(a.id)}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> Approve & send
                  </button>
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={() => reject(a.id)}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground disabled:opacity-50"
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
