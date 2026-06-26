'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, UserPlus, Search, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { DripCampaign, DripStep, DripEnrollment, Contact } from '@/types';

export default function DripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<DripCampaign | null>(null);
  const [steps, setSteps] = useState<DripStep[]>([]);
  const [enrollments, setEnrollments] = useState<DripEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('drip_campaigns').select('*').eq('id', id).single(),
      supabase.from('drip_steps').select('*').eq('campaign_id', id).order('position'),
      supabase.from('drip_enrollments').select('*, contact:contacts(name,phone)').eq('campaign_id', id).order('enrolled_at', { ascending: false }).limit(50),
    ]).then(([c, s, e]) => {
      setCampaign(c.data as DripCampaign);
      setSteps((s.data ?? []) as DripStep[]);
      setEnrollments((e.data ?? []) as DripEnrollment[]);
      setLoading(false);
    });
  }, [id]);

  async function loadContacts() {
    const supabase = createClient();
    const { data } = await supabase.from('contacts').select('*').order('name').limit(200);
    setContacts((data ?? []) as Contact[]);
    setEnrollOpen(true);
  }

  async function enroll() {
    if (!selected.size) return;
    setEnrolling(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user!.id).single();

    const now = new Date().toISOString();
    const rows = Array.from(selected).map(contactId => ({
      campaign_id: id,
      contact_id: contactId,
      account_id: profile?.account_id,
      current_step: 0,
      status: 'active',
      enrolled_at: now,
      next_send_at: now,
    }));

    const { error } = await supabase.from('drip_enrollments').upsert(rows, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true });
    setEnrolling(false);
    if (error) { toast.error('Enrollment failed'); return; }
    toast.success(`${selected.size} contacts enrolled`);
    setSelected(new Set());
    setEnrollOpen(false);
    const { data } = await supabase.from('drip_enrollments').select('*, contact:contacts(name,phone)').eq('campaign_id', id).order('enrolled_at', { ascending: false }).limit(50);
    setEnrollments((data ?? []) as DripEnrollment[]);
  }

  const filtered = contacts.filter(c =>
    !search || (c.name ?? '').toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!campaign) return <p className="text-muted-foreground">Campaign not found</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <Badge variant="outline" className="text-xs capitalize">{campaign.status}</Badge>
          </div>
          {campaign.description && <p className="text-sm text-muted-foreground mt-0.5">{campaign.description}</p>}
        </div>
        <Button onClick={loadContacts} className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">
          <UserPlus className="h-4 w-4 mr-2" />
          Enroll Contacts
        </Button>
      </div>

      {/* Steps */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Sequence ({steps.length} steps)</h2>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <span className="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{step.template_name}</p>
                <p className="text-xs text-muted-foreground">{step.template_language}</p>
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
          <p className="text-sm text-muted-foreground">No contacts enrolled yet</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Contact</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Step</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Status</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Next send</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">{e.contact?.name ?? e.contact?.phone ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.current_step + 1} / {steps.length}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-xs capitalize">{e.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {e.next_send_at ? new Date(e.next_send_at).toLocaleDateString() : '—'}
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
              <h2 className="text-sm font-semibold text-foreground">Enroll Contacts</h2>
              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 bg-muted border-border text-foreground" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2 hover:bg-muted text-left"
                >
                  {selected.has(c.id) ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-sm text-foreground">{c.name ?? c.phone}</span>
                  {c.name && <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>}
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
