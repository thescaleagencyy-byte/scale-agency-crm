'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, UserPlus, Search, CheckSquare, Square, MessageSquareReply, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachSequence, OutreachStep, OutreachEnrollment, OutreachProspect } from '@/types';

export default function OutreachSequenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sequence, setSequence] = useState<OutreachSequence | null>(null);
  const [steps, setSteps] = useState<OutreachStep[]>([]);
  const [enrollments, setEnrollments] = useState<OutreachEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [prospects, setProspects] = useState<OutreachProspect[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);

  async function loadEnrollments() {
    const supabase = createClient();
    const { data } = await supabase
      .from('outreach_enrollments')
      .select('*, prospect:outreach_prospects(*)')
      .eq('sequence_id', id)
      .order('enrolled_at', { ascending: false })
      .limit(200);
    setEnrollments((data ?? []) as OutreachEnrollment[]);
  }

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('outreach_sequences').select('*').eq('id', id).single(),
      supabase.from('outreach_steps').select('*').eq('sequence_id', id).order('position'),
    ]).then(([s, st]) => {
      setSequence(s.data as OutreachSequence);
      setSteps((st.data ?? []) as OutreachStep[]);
      setLoading(false);
    });
    loadEnrollments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadProspects() {
    const supabase = createClient();
    const { data } = await supabase.from('outreach_prospects').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(500);
    setProspects((data ?? []) as OutreachProspect[]);
    setEnrollOpen(true);
  }

  async function enroll() {
    if (!selected.size) return;
    setEnrolling(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user!.id).single();

    const now = new Date().toISOString();
    const rows = Array.from(selected).map(prospectId => ({
      sequence_id: id,
      prospect_id: prospectId,
      account_id: profile?.account_id,
      current_step: 0,
      status: 'active',
      enrolled_at: now,
      next_send_at: now,
    }));

    const { error } = await supabase.from('outreach_enrollments').upsert(rows, { onConflict: 'sequence_id,prospect_id', ignoreDuplicates: true });
    setEnrolling(false);
    if (error) { toast.error('Enrollment failed'); return; }
    toast.success(`${selected.size} prospects enrolled`);
    setSelected(new Set());
    setEnrollOpen(false);
    loadEnrollments();
  }

  async function markEnrollmentStatus(enrollmentId: string, status: 'replied' | 'bounced') {
    setUpdating(enrollmentId);
    const supabase = createClient();
    const { error } = await supabase.from('outreach_enrollments').update({ status }).eq('id', enrollmentId);
    setUpdating(null);
    if (error) { toast.error('Update failed'); return; }
    setEnrollments(prev => prev.map(e => e.id === enrollmentId ? { ...e, status } : e));
    toast.success(`Marked ${status}`);
  }

  async function setSequenceStatus(status: string) {
    if (!sequence) return;
    const supabase = createClient();
    const { error } = await supabase.from('outreach_sequences').update({ status }).eq('id', sequence.id);
    if (error) { toast.error('Update failed'); return; }
    setSequence(prev => prev ? { ...prev, status: status as OutreachSequence['status'] } : prev);
    toast.success(`Sequence ${status}`);
  }

  const filtered = prospects.filter(p =>
    !search || (p.name ?? '').toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!sequence) return <p className="text-muted-foreground">Sequence not found</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{sequence.name}</h1>
            <Badge variant="outline" className="text-xs capitalize">{sequence.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily cap {sequence.daily_cap} · window {sequence.send_window_start_hour}:00–{sequence.send_window_end_hour}:00 UTC
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sequence.status === 'active' ? (
            <Button variant="outline" onClick={() => setSequenceStatus('paused')}>Pause</Button>
          ) : (
            <Button variant="outline" onClick={() => setSequenceStatus('active')}>Activate</Button>
          )}
          <Button onClick={loadProspects} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <UserPlus className="h-4 w-4 mr-2" />
            Enroll Prospects
          </Button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Sequence ({steps.length} steps)</h2>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <span className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{step.subject}</p>
                <p className="text-xs text-muted-foreground truncate">{step.body}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {step.delay_days === 0 ? 'Immediately' : `Day ${step.delay_days}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Enrollments */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Enrollments ({enrollments.length})</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prospects enrolled yet</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Prospect</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Step</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Status</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Next send</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">{e.prospect?.name ?? e.prospect?.email ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.current_step + 1} / {steps.length}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-xs capitalize">{e.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {e.next_send_at ? new Date(e.next_send_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {e.status === 'active' && (
                        <div className="flex items-center gap-1">
                          <button
                            title="Mark replied — stops this prospect's sequence"
                            onClick={() => markEnrollmentStatus(e.id, 'replied')}
                            disabled={updating === e.id}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <MessageSquareReply className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Mark bounced — stops this prospect's sequence"
                            onClick={() => markEnrollmentStatus(e.id, 'bounced')}
                            disabled={updating === e.id}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <MailWarning className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enroll modal */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEnrollOpen(false)}>
          <div className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Enroll Prospects</h2>
              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 bg-muted border-border text-foreground" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No active prospects. Add some on the Prospects page first.</p>
              ) : filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2 hover:bg-muted text-left"
                >
                  {selected.has(p.id) ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-sm text-foreground">{p.name ?? p.email}</span>
                  {p.name && <span className="text-xs text-muted-foreground ml-auto">{p.email}</span>}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-border flex gap-2">
              <Button variant="outline" onClick={() => setEnrollOpen(false)} className="flex-1 border-border bg-transparent text-muted-foreground">Cancel</Button>
              <Button onClick={enroll} disabled={enrolling || !selected.size} className="flex-1 bg-primary text-primary-foreground">
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Enroll {selected.size > 0 ? `(${selected.size})` : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
