'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sunrise, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface DigestStats {
  staleLeads?: number;
}

interface DigestRow {
  id: string;
  content: string;
  generated_at: string;
  stats: DigestStats | null;
}

// The proactive "every morning it says what you should do today"
// surface. WhatsApp delivery isn't wired yet (needs a Meta-approved
// template + a stored owner phone number, see /api/digest/cron) —
// this card is the in-app home for it in the meantime, plus a
// "Generate now" button so it's demoable without waiting for a cron
// tick to actually be scheduled. "Approve all" turns the stale-leads
// section into a real batch action (creates a follow-up reminder for
// every one) instead of the owner reading the list and doing it by
// hand — the CEO Command Center pattern, scoped to an action that's
// actually internal and doesn't need a blocked external send.
export function DailyDigestCard() {
  const [digest, setDigest] = useState<DigestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const loadLatest = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('daily_digests')
      .select('id, content, generated_at, stats')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setDigest(data as DigestRow | null);
    setApproved(false);
    setLoading(false);
  };

  useEffect(() => {
    loadLatest();
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/digest/generate', { method: 'POST' });
      const data = await res.json();
      if (data.digest) { setDigest(data.digest); setApproved(false); }
      else toast.error(data.error || 'Failed to generate briefing.');
    } catch {
      toast.error('Network error generating briefing.');
    } finally {
      setGenerating(false);
    }
  };

  const approveStaleLeads = async () => {
    setApproving(true);
    try {
      const res = await fetch('/api/digest/approve-stale-leads', { method: 'POST' });
      const data = await res.json();
      if (typeof data.created === 'number') {
        toast.success(data.created > 0 ? `Created ${data.created} follow-up reminders.` : (data.message || 'Nothing to do.'));
        setApproved(true);
      } else {
        toast.error(data.error || 'Failed to create reminders.');
      }
    } catch {
      toast.error('Network error creating reminders.');
    } finally {
      setApproving(false);
    }
  };

  const isToday = digest && new Date(digest.generated_at).toDateString() === new Date().toDateString();
  const staleLeadsCount = digest?.stats?.staleLeads ?? 0;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-zinc-900 p-6 text-white shadow-elevated">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary opacity-[0.14] blur-[60px]" />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
          <Sunrise className="h-3.5 w-3.5" />
          Daily Briefing {isToday ? '· Today' : digest ? `· ${new Date(digest.generated_at).toLocaleDateString()}` : ''}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/15 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Generate now
        </button>
      </div>

      <div className="relative mt-4 whitespace-pre-line text-sm leading-relaxed text-white/90">
        {loading ? (
          <span className="text-white/50">Loading...</span>
        ) : digest ? (
          digest.content
        ) : (
          <span className="text-white/50">No briefing yet — click &quot;Generate now&quot; to create today&apos;s.</span>
        )}
      </div>

      {staleLeadsCount > 0 && (
        <div className="relative mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
          {approved ? (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Reminders created for all {staleLeadsCount} stale leads.
            </span>
          ) : (
            <button
              type="button"
              onClick={approveStaleLeads}
              disabled={approving}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Approve — set follow-up reminders for all {staleLeadsCount} stale leads
            </button>
          )}
        </div>
      )}
    </div>
  );
}
