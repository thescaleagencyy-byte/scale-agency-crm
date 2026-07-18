'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Radio } from 'lucide-react';

interface PublicStatus {
  account_name: string;
  whatsapp_connected: boolean;
  quality_rating: string | null;
  last_activity_at: string | null;
}

function activityLabel(lastActivityAt: string | null): { label: string; ok: boolean } {
  if (!lastActivityAt) return { label: 'No activity recorded yet', ok: false };
  const daysSince = (Date.now() - new Date(lastActivityAt).getTime()) / 86400000;
  if (daysSince <= 1) return { label: 'Active in the last 24 hours', ok: true };
  if (daysSince <= 7) return { label: `Active ${Math.round(daysSince)} days ago`, ok: true };
  return { label: `No activity in ${Math.round(daysSince)} days`, ok: false };
}

export default function PublicStatusPage() {
  const params = useParams<{ accountId: string }>();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/status/${params.accountId}`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return; }
        const data = await r.json();
        setStatus(data);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [params.accountId]);

  if (loading) {
    return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
  }

  if (notFound || !status) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Status page not found.</p>
      </div>
    );
  }

  const activity = activityLabel(status.last_activity_at);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-5">
      <div className="text-center space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</p>
        <h1 className="text-xl font-bold text-foreground">{status.account_name}</h1>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">WhatsApp connection</span>
          </div>
          {status.whatsapp_connected ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
              <XCircle className="h-3.5 w-3.5" />Disconnected
            </span>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
          <span className="text-sm text-foreground">Recent activity</span>
          <span className={`text-xs font-medium ${activity.ok ? 'text-primary' : 'text-muted-foreground'}`}>
            {activity.label}
          </span>
        </div>

        {status.quality_rating && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
            <span className="text-sm text-foreground">WhatsApp quality rating</span>
            <span className="text-xs font-medium text-foreground capitalize">{status.quality_rating}</span>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">Powered by The Scale Agency</p>
    </div>
  );
}
