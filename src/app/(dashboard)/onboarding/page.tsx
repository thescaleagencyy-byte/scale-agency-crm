'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, MessageCircle, PhoneCall, Settings2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

type Step = 'welcome' | 'connect' | 'test' | 'done';

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: 'welcome', label: 'Welcome', icon: Zap },
  { id: 'connect', label: 'Connect WhatsApp', icon: PhoneCall },
  { id: 'test', label: 'Send test message', icon: MessageCircle },
  { id: 'done', label: 'Done', icon: CheckCircle2 },
];

declare global {
  interface Window {
    FB?: {
      init: (opts: object) => void;
      login: (cb: (r: { authResponse?: { code?: string } }) => void, opts: object) => void;
    };
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [step, setStep] = useState<Step>('welcome');
  const [connecting, setConnecting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [fbLoaded, setFbLoaded] = useState(false);

  const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? ''

  // Load Facebook SDK
  useEffect(() => {
    if (document.getElementById('facebook-jssdk')) { setFbLoaded(true); return; }
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onload = () => {
      window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v19.0' });
      setFbLoaded(true);
    };
    document.head.appendChild(script);
  }, [META_APP_ID]);

  // Check if WA already configured for this account
  useEffect(() => {
    if (!accountId) return;
    createClient()
      .from('whatsapp_config')
      .select('id, status')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status === 'active') setAlreadyConnected(true);
      });
  }, [accountId]);

  const launchEmbeddedSignup = useCallback(() => {
    if (!fbLoaded || !window.FB) { toast.error('Facebook SDK not loaded yet. Refresh and try again.'); return; }
    if (!META_APP_ID) {
      toast.error('META_APP_ID not configured. Set NEXT_PUBLIC_META_APP_ID in your env vars.');
      return;
    }
    setConnecting(true);
    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) { setConnecting(false); toast.error('WhatsApp signup cancelled or failed'); return; }

        // Exchange code for permanent token via our API
        const res = await fetch('/api/whatsapp/embedded-signup/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const json = await res.json();
        setConnecting(false);
        if (!res.ok) { toast.error(json.error ?? 'Failed to connect'); return; }
        toast.success('WhatsApp connected!');
        setStep('test');
      },
      {
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        extras: {
          feature: 'whatsapp_embedded_signup',
          setup: { business: { timezone: 'UTC' } },
        },
        return_scopes: true,
      },
    );
  }, [fbLoaded, META_APP_ID]);

  async function sendTestMessage() {
    if (!testPhone.trim()) { toast.error('Enter your WhatsApp number'); return; }
    setTesting(true);
    const db = createClient();
    // Find or create a contact + conversation for test
    const { data: conv } = await db.from('conversations').select('id').limit(1).maybeSingle();
    if (!conv) { toast.error('No conversations yet — test by sending a message from your WA number first'); setTesting(false); return; }

    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conv.id,
        text: '👋 Test message from your CRM. If you see this, WhatsApp is connected successfully!',
      }),
    });
    setTesting(false);
    if (res.ok) { setTestSent(true); toast.success('Test message sent!'); }
    else { const j = await res.json(); toast.error(j.error ?? 'Send failed'); }
  }

  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = s.id === step;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  done ? 'border-primary bg-primary text-primary-foreground' : active ? 'border-primary text-primary' : 'border-border text-muted-foreground',
                )}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('h-0.5 flex-1 transition-colors', done ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
          {step === 'welcome' && (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">Welcome to your CRM</h1>
                <p className="text-muted-foreground text-sm">Let&apos;s get your WhatsApp Business number connected. It takes about 2 minutes and uses Meta&apos;s official secure flow — no unofficial methods.</p>
              </div>
              <div className="space-y-3">
                {[
                  'Connect your WhatsApp Business number via Meta',
                  'Webhook auto-registered — no manual copy-pasting',
                  'Send a test message to confirm everything works',
                ].map((t, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    {t}
                  </div>
                ))}
              </div>
              {alreadyConnected && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                  WhatsApp already connected for this workspace. You can reconnect or skip to the inbox.
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={() => setStep('connect')} className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1">
                  Get started
                </Button>
                {alreadyConnected && (
                  <Button variant="outline" onClick={() => router.push('/inbox')} className="border-border text-muted-foreground">
                    Go to inbox
                  </Button>
                )}
              </div>
            </>
          )}

          {step === 'connect' && (
            <>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><PhoneCall className="h-5 w-5 text-primary" />Connect WhatsApp</h2>
                <p className="text-muted-foreground text-sm">
                  Click the button below. A Meta popup will open — log in with the Facebook account that manages your WhatsApp Business account, then follow the steps to grant access.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground text-sm">Before you click:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>You need a WhatsApp Business account (not personal)</li>
                  <li>The Facebook account must have admin access to the WABA</li>
                  <li>Pop-ups must be allowed for this site</li>
                </ul>
              </div>
              <Button
                onClick={launchEmbeddedSignup}
                disabled={connecting || !fbLoaded}
                className="w-full bg-[#1877F2] hover:bg-[#1877F2]/90 text-white gap-2"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
                {connecting ? 'Connecting...' : 'Connect via Meta'}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Uses Meta&apos;s official Embedded Signup. We never store your Facebook password.
              </p>
            </>
          )}

          {step === 'test' && (
            <>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" />Send a test message</h2>
                <p className="text-muted-foreground text-sm">Confirm the connection works by sending a test message to yourself or a colleague.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Your WhatsApp number (to receive the test)</Label>
                <Input
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+971501234567"
                  className="border-border bg-muted text-foreground font-mono"
                />
              </div>
              {testSent ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />Test message sent! Check your WhatsApp.
                </div>
              ) : (
                <Button onClick={sendTestMessage} disabled={testing} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Send test message
                </Button>
              )}
              <Button variant="outline" onClick={() => setStep('done')} className="w-full border-border text-muted-foreground">
                {testSent ? 'Continue →' : 'Skip test'}
              </Button>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="flex flex-col items-center gap-4 text-center py-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-foreground">You&apos;re all set!</h2>
                  <p className="text-sm text-muted-foreground">WhatsApp is connected. Incoming messages will appear in your inbox. Go ahead and explore.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => router.push('/inbox')} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full">
                  Open inbox
                </Button>
                <Button variant="outline" onClick={() => router.push('/settings?tab=whatsapp')} className="border-border text-muted-foreground w-full">
                  Review WhatsApp settings
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
