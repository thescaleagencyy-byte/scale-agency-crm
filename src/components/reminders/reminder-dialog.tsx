'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Bell } from 'lucide-react';
import { toast } from 'sonner';
import type { ReminderEntityType } from '@/types';

interface Props {
  entityType: ReminderEntityType;
  entityId: string;
  entityLabel: string;
  onClose: () => void;
}

export function ReminderDialog({ entityType, entityId, entityLabel, onClose }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 16);

  const [dueAt, setDueAt] = useState(defaultDate);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!dueAt) { toast.error('Pick a date'); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not signed in'); setSaving(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase.from('follow_up_reminders').insert({
      account_id: profile?.account_id,
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      due_at: new Date(dueAt).toISOString(),
      note: note.trim() || null,
    });

    setSaving(false);
    if (error) { toast.error('Failed to set reminder'); return; }
    toast.success('Reminder set');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Set Reminder</h2>
        </div>
        <p className="text-xs text-muted-foreground">{entityLabel}</p>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Remind me on</Label>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={e => setDueAt(e.target.value)}
            className="border-border bg-muted text-foreground"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Note (optional)</Label>
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What to follow up on..."
            className="min-h-[60px] border-border bg-muted text-foreground text-sm resize-none"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 border-border bg-transparent text-muted-foreground">
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="flex-1 bg-primary text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set Reminder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
