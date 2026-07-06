'use client';

// ============================================================
// AddMemberDialog — direct member creation, no invite link.
//
// The admin fills name + email + password + role; the server
// creates the auth user with the email pre-confirmed and attaches
// the profile to this workspace. Credentials are handed over
// out-of-band (WhatsApp, in person) — the agency-managed pattern
// where teammates don't self-serve signup.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CreatableRole = 'admin' | 'agent' | 'viewer';

const MIN_PASSWORD = 8;

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create so the parent re-fetches the roster. */
  onCreated: () => void;
}

export function AddMemberDialog({ open, onOpenChange, onCreated }: AddMemberDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<CreatableRole>('agent');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('agent');
    setSubmitting(false);
  }

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      toast.error(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to add member');
        return;
      }
      toast.success(`${fullName.trim() || email} added as ${role} — share their login details with them`);
      onCreated();
      close(false);
    } catch {
      toast.error('Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            Add member directly
          </DialogTitle>
          <DialogDescription>
            Creates the account instantly with the email and password you set —
            no invite link, no email confirmation. Share the credentials with
            your teammate yourself.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="am-name">Full name</Label>
            <Input
              id="am-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ali Raza"
              maxLength={120}
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="am-email">Email</Label>
            <Input
              id="am-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ali@ashwheelz.com"
              autoComplete="off"
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="am-password">Password</Label>
            <Input
              id="am-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              disabled={submitting}
              className="font-mono"
              required
            />
            <p className="text-xs text-muted-foreground">
              Shown in plain text so you can copy it for the teammate. They can
              change it later in Settings.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as CreatableRole)}>
              <SelectTrigger className="w-full" disabled={submitting}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — full workspace control</SelectItem>
                <SelectItem value="agent">Agent — inbox, contacts, leads</SelectItem>
                <SelectItem value="viewer">Viewer — read-only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => close(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !fullName.trim() || !email.trim() || !password}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create member'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
