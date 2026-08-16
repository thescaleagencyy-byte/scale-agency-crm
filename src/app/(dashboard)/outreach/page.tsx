'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Mail, Play, Pause, Archive, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachSequence } from '@/types';

const STATUS_CLASS: Record<string, string> = {
  draft:    'bg-muted text-muted-foreground border-border',
  active:   'bg-green-500/15 text-green-600 border-green-500/30',
  paused:   'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  archived: 'bg-muted/50 text-muted-foreground border-border',
};

export default function OutreachPage() {
  const router = useRouter();
  const [sequences, setSequences] = useState<OutreachSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('outreach_sequences')
      .select('*, steps:outreach_steps(count), enrollments:outreach_enrollments(count)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setSequences((data ?? []) as OutreachSequence[]);
        setLoading(false);
      });
  }, []);

  async function setStatus(id: string, status: string) {
    setUpdating(id);
    const supabase = createClient();
    const { error } = await supabase.from('outreach_sequences').update({ status }).eq('id', id);
    if (error) toast.error('Update failed');
    else {
      setSequences(prev => prev.map(s => s.id === id ? { ...s, status: status as OutreachSequence['status'] } : s));
      toast.success(`Sequence ${status}`);
    }
    setUpdating(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Outreach</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cold email sequences, sent via your connected Gmail</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/outreach/prospects')}>
            <Users className="h-4 w-4 mr-2" />
            Prospects
          </Button>
          <Button
            onClick={() => router.push('/outreach/new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Sequence
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center card-elevated py-16 gap-3">
          <Mail className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No outreach sequences yet</p>
          <p className="text-xs text-muted-foreground">Create a sequence and connect Gmail under Integrations to start sending</p>
          <Button onClick={() => router.push('/outreach/new')} className="mt-2 bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            New Sequence
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map(sequence => (
            <div
              key={sequence.id}
              className="flex items-center gap-4 card-elevated p-4 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => router.push(`/outreach/${sequence.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground truncate">{sequence.name}</h3>
                  <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_CLASS[sequence.status]}`}>
                    {sequence.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Daily cap: <span className="text-foreground">{sequence.daily_cap}</span>
                  {' · '}
                  Send window: <span className="text-foreground">{sequence.send_window_start_hour}:00–{sequence.send_window_end_hour}:00 UTC</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                {sequence.status === 'active' ? (
                  <button
                    onClick={() => setStatus(sequence.id, 'paused')}
                    disabled={updating === sequence.id}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {updating === sequence.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                    Pause
                  </button>
                ) : sequence.status === 'paused' || sequence.status === 'draft' ? (
                  <button
                    onClick={() => setStatus(sequence.id, 'active')}
                    disabled={updating === sequence.id}
                    className="flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                  >
                    {updating === sequence.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Activate
                  </button>
                ) : null}
                {sequence.status !== 'archived' && (
                  <button
                    onClick={() => setStatus(sequence.id, 'archived')}
                    disabled={updating === sequence.id}
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
