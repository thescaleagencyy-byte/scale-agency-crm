'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ArrowLeft } from 'lucide-react';

interface Step {
  delay_days: number;
  subject: string;
  body: string;
}

export default function NewOutreachSequencePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dailyCap, setDailyCap] = useState(30);
  const [windowStart, setWindowStart] = useState(9);
  const [windowEnd, setWindowEnd] = useState(18);
  const [steps, setSteps] = useState<Step[]>([{ delay_days: 0, subject: '', body: '' }]);
  const [saving, setSaving] = useState(false);

  function addStep() {
    const lastDelay = steps[steps.length - 1]?.delay_days ?? 0;
    setSteps(prev => [...prev, { delay_days: lastDelay + 3, subject: '', body: '' }]);
  }

  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, field: keyof Step, value: string | number) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  async function save() {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (steps.some(s => !s.subject.trim() || !s.body.trim())) { toast.error('Every step needs a subject and body'); return; }
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not signed in'); setSaving(false); return; }
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();

    const { data: sequence, error: seqErr } = await supabase
      .from('outreach_sequences')
      .insert({
        account_id: profile?.account_id,
        user_id: user.id,
        name: name.trim(),
        daily_cap: dailyCap,
        send_window_start_hour: windowStart,
        send_window_end_hour: windowEnd,
        status: 'draft',
      })
      .select()
      .single();

    if (seqErr) { toast.error('Failed to create sequence'); setSaving(false); return; }

    const stepRows = steps.map((s, i) => ({
      sequence_id: sequence.id,
      position: i,
      delay_days: s.delay_days,
      subject: s.subject.trim(),
      body: s.body.trim(),
    }));

    const { error: stepsErr } = await supabase.from('outreach_steps').insert(stepRows);
    if (stepsErr) { toast.error('Failed to save steps'); setSaving(false); return; }

    toast.success('Sequence created');
    router.push(`/outreach/${sequence.id}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-foreground">New Outreach Sequence</h1>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Restaurant Cold Outreach" className="border-border bg-muted text-foreground" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Daily cap</Label>
            <Input type="number" min={1} max={100} value={dailyCap} onChange={e => setDailyCap(parseInt(e.target.value) || 1)} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Send window start (UTC hour)</Label>
            <Input type="number" min={0} max={23} value={windowStart} onChange={e => setWindowStart(parseInt(e.target.value) || 0)} className="border-border bg-muted text-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Send window end (UTC hour)</Label>
            <Input type="number" min={0} max={23} value={windowEnd} onChange={e => setWindowEnd(parseInt(e.target.value) || 0)} className="border-border bg-muted text-foreground" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A conservative daily cap (default 30) and a plain-text body keep this reading as real email, not a blast — that matters for a personal Gmail account&apos;s deliverability.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Steps</h2>
          <button onClick={addStep} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
        </div>

        {steps.map((step, i) => (
          <div key={i} className="card-elevated p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Step {i + 1}</span>
              {steps.length > 1 && (
                <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Send after (days)</Label>
              <Input
                type="number"
                min={0}
                value={step.delay_days}
                onChange={e => updateStep(i, 'delay_days', parseInt(e.target.value) || 0)}
                className="border-border bg-muted text-foreground w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Subject</Label>
              <Input
                value={step.subject}
                onChange={e => updateStep(i, 'subject', e.target.value)}
                placeholder="Quick question about {{company}}"
                className="border-border bg-muted text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Body — {'{{first_name}}'} and {'{{company}}'} get replaced per prospect</Label>
              <Textarea
                value={step.body}
                onChange={e => updateStep(i, 'body', e.target.value)}
                placeholder={'Hi {{first_name}},\n\nWe help businesses like {{company}}...'}
                className="border-border bg-muted text-foreground min-h-[140px]"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()} className="border-border bg-transparent text-muted-foreground">
          Cancel
        </Button>
        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create Sequence
        </Button>
      </div>
    </div>
  );
}
