'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sunrise, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DigestRow {
  id: string;
  content: string;
  generated_at: string;
}

// The proactive "every morning it says what you should do today"
// surface. WhatsApp delivery isn't wired yet (needs a Meta-approved
// template + a stored owner phone number, see /api/digest/cron) —
// this card is the in-app home for it in the meantime, plus a
// "Generate now" button so it's demoable without waiting for a cron
// tick to actually be scheduled.
export function DailyDigestCard() {
  const [digest, setDigest] = useState<DigestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadLatest = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('daily_digests')
      .select('id, content, generated_at')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setDigest(data as DigestRow | null);
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
      if (data.digest) setDigest(data.digest);
      else toast.error(data.error || 'Failed to generate briefing.');
    } catch {
      toast.error('Network error generating briefing.');
    } finally {
      setGenerating(false);
    }
  };

  const isToday = digest && new Date(digest.generated_at).toDateString() === new Date().toDateString();

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
    </div>
  );
}
