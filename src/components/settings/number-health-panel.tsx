'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsPanelHead } from './settings-panel-head';
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, ShieldOff, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type Rating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

interface HealthSnap {
  quality_rating: Rating;
  messaging_limit_tier: string;
  display_phone_number: string;
  verified_name: string;
}

interface HistoryRow {
  id: string;
  quality_rating: Rating;
  messaging_limit_tier: string | null;
  recorded_at: string;
}

const RATING_META: Record<Rating, { label: string; icon: React.ElementType; color: string; bg: string; desc: string }> = {
  GREEN: { label: 'High quality', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', desc: 'Number is in good standing. No risk of restrictions.' },
  YELLOW: { label: 'Medium quality', icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-400/10', desc: 'Quality dropping. Review recent templates — high opt-outs or blocks detected.' },
  RED: { label: 'Low quality', icon: ShieldOff, color: 'text-red-500', bg: 'bg-red-500/10', desc: 'At risk of messaging restrictions. Stop aggressive outreach immediately.' },
  UNKNOWN: { label: 'Unknown', icon: TrendingDown, color: 'text-muted-foreground', bg: 'bg-muted', desc: 'Could not fetch rating. Check WhatsApp config.' },
};

const TIER_LABELS: Record<string, string> = {
  TIER_1K: '1,000 msgs / day',
  TIER_10K: '10,000 msgs / day',
  TIER_100K: '100,000 msgs / day',
  TIER_UNLIMITED: 'Unlimited',
};

export function NumberHealthPanel() {
  const { accountId } = useAuth();
  const [health, setHealth] = useState<HealthSnap | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(true);

  async function fetchHistory() {
    if (!accountId) return;
    const db = createClient();
    const { data } = await db
      .from('wa_quality_history')
      .select('id, quality_rating, messaging_limit_tier, recorded_at')
      .eq('account_id', accountId)
      .order('recorded_at', { ascending: false })
      .limit(10);
    setHistory((data ?? []) as HistoryRow[]);
    setHistLoading(false);
  }

  useEffect(() => { fetchHistory(); }, [accountId]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/health');
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? 'Failed to fetch health'); setLoading(false); return; }
      setHealth(json as HealthSnap);
      fetchHistory();
      toast.success('Health refreshed');
    } catch { toast.error('Failed to reach Meta'); }
    setLoading(false);
  }

  const meta = health ? RATING_META[health.quality_rating] ?? RATING_META.UNKNOWN : null;

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Number Health"
        description="Monitor your WhatsApp number quality rating and messaging tier. Low quality can lead to Meta restricting or banning your number."
      />

      {/* Current status card */}
      <div className={cn('rounded-xl border p-5 flex items-start gap-4', meta ? meta.bg : 'bg-muted/30')}>
        {meta ? (
          <>
            <meta.icon className={cn('h-8 w-8 mt-0.5 shrink-0', meta.color)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={cn('text-base font-bold', meta.color)}>{meta.label}</span>
                {health?.display_phone_number && (
                  <span className="text-xs text-muted-foreground font-mono">{health.display_phone_number}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{meta.desc}</p>
              {health?.messaging_limit_tier && (
                <p className="text-xs text-muted-foreground mt-2">
                  Messaging tier: <span className="font-medium text-foreground">{TIER_LABELS[health.messaging_limit_tier] ?? health.messaging_limit_tier}</span>
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Click "Check now" to fetch current status from Meta.</div>
        )}
      </div>

      <Button onClick={refresh} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Check now
      </Button>

      {/* History */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Recent checks</p>
        {histLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No checks recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {history.map(h => {
              const m = RATING_META[h.quality_rating as Rating] ?? RATING_META.UNKNOWN;
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <m.icon className={cn('h-4 w-4 shrink-0', m.color)} />
                  <span className={cn('text-xs font-semibold', m.color)}>{m.label}</span>
                  {h.messaging_limit_tier && (
                    <span className="text-xs text-muted-foreground">{TIER_LABELS[h.messaging_limit_tier] ?? h.messaging_limit_tier}</span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(h.recorded_at), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 space-y-1">
        <p className="font-semibold text-amber-100">Tips to maintain GREEN status</p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-200/80">
          <li>Only message contacts who opted in</li>
          <li>Avoid bulk messaging cold contacts</li>
          <li>Keep template language natural — avoid spam-style copy</li>
          <li>High opt-out rates tank quality fastest</li>
        </ul>
      </div>
    </div>
  );
}
