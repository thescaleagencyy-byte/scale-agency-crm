'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Zap, Play, Pause, Archive } from 'lucide-react';
import { toast } from 'sonner';
import type { DripCampaign } from '@/types';

const STATUS_CLASS: Record<string, string> = {
  draft:    'bg-muted text-muted-foreground border-border',
  active:   'bg-green-500/15 text-green-600 border-green-500/30',
  paused:   'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  archived: 'bg-muted/50 text-muted-foreground border-border',
};

export default function DripPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('drip_campaigns')
      .select('*, steps:drip_steps(count), enrollments:drip_enrollments(count)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setCampaigns((data ?? []) as DripCampaign[]);
        setLoading(false);
      });
  }, []);

  async function setStatus(id: string, status: string) {
    setUpdating(id);
    const supabase = createClient();
    const { error } = await supabase.from('drip_campaigns').update({ status }).eq('id', id);
    if (error) toast.error('Update failed');
    else {
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: status as DripCampaign['status'] } : c));
      toast.success(`Campaign ${status}`);
    }
    setUpdating(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drip Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Automated multi-step message sequences</p>
        </div>
        <Button
          onClick={() => router.push('/drip/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 gap-3">
          <Zap className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No drip campaigns yet</p>
          <p className="text-xs text-muted-foreground">Create sequences to nurture contacts over time</p>
          <Button onClick={() => router.push('/drip/new')} className="mt-2 bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(campaign => (
            <div
              key={campaign.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => router.push(`/drip/${campaign.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate">{campaign.name}</h3>
                  <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_CLASS[campaign.status]}`}>
                    {campaign.status}
                  </Badge>
                </div>
                {campaign.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{campaign.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Trigger: <span className="text-foreground">{campaign.enroll_trigger.replace('_', ' ')}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                {campaign.status === 'active' ? (
                  <button
                    onClick={() => setStatus(campaign.id, 'paused')}
                    disabled={updating === campaign.id}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                    Pause
                  </button>
                ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
                  <button
                    onClick={() => setStatus(campaign.id, 'active')}
                    disabled={updating === campaign.id}
                    className="flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                  >
                    {updating === campaign.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Activate
                  </button>
                ) : null}
                {campaign.status !== 'archived' && (
                  <button
                    onClick={() => setStatus(campaign.id, 'archived')}
                    disabled={updating === campaign.id}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <Archive className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
