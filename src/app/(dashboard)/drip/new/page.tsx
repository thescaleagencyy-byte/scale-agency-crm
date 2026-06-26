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
import type { DripEnrollTrigger } from '@/types';

interface Step {
  delay_days: number;
  template_name: string;
  template_language: string;
}

export default function NewDripPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<DripEnrollTrigger>('manual');
  const [steps, setSteps] = useState<Step[]>([{ delay_days: 0, template_name: '', template_language: 'en_US' }]);
  const [saving, setSaving] = useState(false);

  function addStep() {
    const lastDelay = steps[steps.length - 1]?.delay_days ?? 0;
    setSteps(prev => [...prev, { delay_days: lastDelay + 3, template_name: '', template_language: 'en_US' }]);
  }

  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, field: keyof Step, value: string | number) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  async function save() {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (steps.some(s => !s.template_name.trim())) { toast.error('All steps need a template name'); return; }
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not signed in'); setSaving(false); return; }
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();

    const { data: campaign, error: campErr } = await supabase
      .from('drip_campaigns')
      .insert({
        account_id: profile?.account_id,
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        enroll_trigger: trigger,
        status: 'draft',
      })
      .select()
      .single();

    if (campErr) { toast.error('Failed to create campaign'); setSaving(false); return; }

    const stepRows = steps.map((s, i) => ({
      campaign_id: campaign.id,
      position: i,
      delay_days: s.delay_days,
      template_name: s.template_name.trim(),
      template_language: s.template_language,
    }));

    const { error: stepsErr } = await supabase.from('drip_steps').insert(stepRows);
    if (stepsErr) { toast.error('Failed to save steps'); setSaving(false); return; }

    toast.success('Campaign created');
    router.push(`/drip/${campaign.id}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-foreground">New Drip Campaign</h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Lead Nurture" className="border-border bg-muted text-foreground" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Description (optional)</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this campaign do?" className="border-border bg-muted text-foreground min-h-[60px]" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Enroll trigger</Label>
          <select
            value={trigger}
            onChange={e => setTrigger(e.target.value as DripEnrollTrigger)}
            className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="manual">Manual (enroll contacts manually)</option>
            <option value="lead_created">On lead created</option>
            <option value="contact_created">On contact created</option>
            <option value="tag_added">On tag added</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Steps</h2>
          <button onClick={addStep} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
        </div>

        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Step {i + 1}</span>
              {steps.length > 1 && (
                <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Send after (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={step.delay_days}
                  onChange={e => updateStep(i, 'delay_days', parseInt(e.target.value) || 0)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Language</Label>
                <Input
                  value={step.template_language}
                  onChange={e => updateStep(i, 'template_language', e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Template name</Label>
              <Input
                value={step.template_name}
                onChange={e => updateStep(i, 'template_name', e.target.value)}
                placeholder="approved_template_name"
                className="border-border bg-muted text-foreground"
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
          Create Campaign
        </Button>
      </div>
    </div>
  );
}
