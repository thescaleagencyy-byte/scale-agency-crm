'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles, KeyRound, Trash2 } from 'lucide-react';

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
import { SettingsPanelHead } from './settings-panel-head';
import { AI_NAME } from '@/lib/features';

// ============================================================
// AI Insights settings — the workspace Claude API key that powers
// the header AI widget (see AI_NAME in @/lib/features — "AshWheelz
// AI", "Scale Agency AI", etc, per deployment). The key is write-only
// from this panel's perspective: the server stores it encrypted and
// only ever returns a ••••XXXX hint.
// ============================================================

export function AIConfigPanel() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { configured: false, hint: null }))
      .then((d: { configured: boolean; hint: string | null }) => {
        if (!cancelled) {
          setConfigured(d.configured);
          setHint(d.hint);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_api_key: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save key');
        return;
      }
      setConfigured(true);
      setHint(data.hint ?? null);
      setKeyInput('');
      toast.success(`Claude API key saved — ${AI_NAME} now runs on Claude`);
    } catch {
      toast.error('Could not reach the server');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_api_key: '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to remove key');
        return;
      }
      setConfigured(false);
      setHint(null);
      toast.success('Claude API key removed');
    } catch {
      toast.error('Could not reach the server');
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="max-w-2xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title="AI Insights"
        description={`Power the ${AI_NAME} assistant in the header. Ask anything about leads, pipeline, appointments and conversations — answers come from your live CRM data.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <KeyRound className="size-4 text-primary" />
            Claude API key
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Get a key from console.anthropic.com. Stored encrypted — it is
            never shown again after saving.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking configuration…
            </div>
          ) : (
            <>
              {configured && (
                <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <Sparkles className="size-4 text-primary" />
                    Key active
                    {hint && (
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {hint}
                      </code>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clear}
                    disabled={clearing}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {clearing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Remove
                  </Button>
                </div>
              )}

              <form onSubmit={save} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="claude-key" className="text-foreground">
                    {configured ? 'Replace key' : 'API key'}
                  </Label>
                  <Input
                    id="claude-key"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="sk-ant-…"
                    autoComplete="off"
                    disabled={saving}
                    className="font-mono"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={saving || !keyInput.trim()}>
                    {saving ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      'Save key'
                    )}
                  </Button>
                </div>
              </form>

              <p className="text-xs text-muted-foreground">
                Without a key the assistant falls back to the agency-managed
                engine. With a key, answers run on Claude under your own
                billing.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
