'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// ============================================================
// Two-factor authentication (TOTP) — Supabase MFA.
//
// Enroll flow: enroll() → show QR + secret → user scans with an
// authenticator app → challengeAndVerify() with the 6-digit code.
// Requires MFA to be enabled in the Supabase Auth dashboard;
// enroll() surfaces a readable error if it isn't.
// ============================================================

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

export function TwoFactorCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).filter((f) => f.status === 'verified'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (!cancelled) {
        setFactors((data?.totp ?? []).filter((f) => f.status === 'verified'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    });
    setEnrolling(false);
    if (error || !data) {
      toast.error(error?.message ?? 'Could not start 2FA enrollment', {
        description: 'MFA may need to be enabled in the Supabase Auth settings first.',
      });
      return;
    }
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setCode('');
  };

  const cancelEnroll = async () => {
    // Drop the unverified factor so it doesn't linger in the list.
    if (factorId) {
      const supabase = createClient();
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    }
    setQr(null);
    setSecret(null);
    setFactorId(null);
    setCode('');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !code.trim()) return;
    setVerifying(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    setVerifying(false);
    if (error) {
      toast.error('Wrong code — try again');
      return;
    }
    toast.success('Two-factor authentication enabled');
    setQr(null);
    setSecret(null);
    setFactorId(null);
    setCode('');
    await refresh();
  };

  const remove = async (id: string) => {
    setRemoving(id);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setRemoving(null);
    if (error) {
      toast.error(`Could not remove 2FA: ${error.message}`);
      return;
    }
    toast.success('Two-factor authentication removed');
    await refresh();
  };

  const enabled = factors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Two-factor authentication
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Add a 6-digit code from an authenticator app (Google Authenticator,
          Authy, 1Password) as a second step at sign-in.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {enabled && (
          <ul className="space-y-2">
            {factors.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Smartphone className="size-4 text-primary" />
                  {f.friendly_name || 'Authenticator App'}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Active
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(f.id)}
                  disabled={removing === f.id}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {removing === f.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!qr && !enabled && (
          <Button type="button" onClick={startEnroll} disabled={enrolling}>
            {enrolling ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              'Enable 2FA'
            )}
          </Button>
        )}

        {qr && (
          <form onSubmit={verify} className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              {/* White tile so the QR stays scannable in dark mode. */}
              <div className="rounded-lg bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="2FA QR code" className="h-36 w-36" />
              </div>
              <div className="min-w-48 flex-1 space-y-2">
                <p className="text-sm text-foreground">
                  Scan with your authenticator app, then enter the 6-digit code
                  below.
                </p>
                {secret && (
                  <p className="text-xs text-muted-foreground">
                    Can&apos;t scan? Enter this key manually:{' '}
                    <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                      {secret}
                    </code>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totp-code" className="text-foreground">
                Verification code
              </Label>
              <Input
                id="totp-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="max-w-40 text-center font-mono tracking-widest"
                disabled={verifying}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={verifying || code.length !== 6}>
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  'Verify & enable'
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelEnroll} disabled={verifying}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
