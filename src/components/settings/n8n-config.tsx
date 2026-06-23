'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

const MASKED_KEY = '••••••••••••••••';

export function N8nConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/n8n/config');
      const data = await res.json();
      if (data.config) {
        setWebhookUrl(data.config.webhook_url ?? '');
        setApiUrl(data.config.api_url ?? '');
        setApiKey(data.config.has_api_key ? MASKED_KEY : '');
        setHasExistingKey(data.config.has_api_key);
        setKeyEdited(false);
      }
    } catch (err) {
      console.error('Failed to load n8n config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    try {
      setSaving(true);
      const payload: Record<string, string | null> = {
        webhook_url: webhookUrl.trim() || null,
        api_url: apiUrl.trim() || null,
        api_key: null,
      };

      if (keyEdited && apiKey !== MASKED_KEY && apiKey.trim()) {
        payload.api_key = apiKey.trim();
      } else if (!hasExistingKey && !apiKey.trim()) {
        payload.api_key = null;
      }

      const res = await fetch('/api/n8n/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save');
        return;
      }

      toast.success('n8n configuration saved.');
      await fetchConfig();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Clear all n8n settings? This will stop webhook forwarding and disconnect the dashboard.')) return;
    try {
      setResetting(true);
      const res = await fetch('/api/n8n/config', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to reset');
        return;
      }
      toast.success('n8n configuration cleared.');
      setWebhookUrl('');
      setApiUrl('');
      setApiKey('');
      setKeyEdited(false);
      setHasExistingKey(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to reset');
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="n8n Integration"
          description="Forward Meta webhook events to n8n and view live automation executions."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="n8n Integration"
        description="Forward Meta webhook events to n8n and view live automation executions in the n8n dashboard."
      />

      <div className="space-y-6">
        {/* Webhook forwarding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Webhook Forwarding</CardTitle>
            <CardDescription className="text-muted-foreground">
              Meta events received by this CRM will be forwarded to your n8n webhook trigger URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">n8n Webhook Trigger URL</Label>
              <Input
                placeholder="https://your-n8n.io/webhook/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The webhook trigger URL from your n8n workflow. Every Meta event (messages, statuses) will be forwarded here.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Live dashboard credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Live Dashboard</CardTitle>
            <CardDescription className="text-muted-foreground">
              Connect to the n8n API to show live automation executions in the CRM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">n8n Instance URL</Label>
              <Input
                placeholder="https://your-n8n.io"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Your n8n base URL — no trailing slash.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">n8n API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="Enter your n8n API key"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeyEdited(true);
                  }}
                  onFocus={() => {
                    if (apiKey === MASKED_KEY) {
                      setApiKey('');
                      setKeyEdited(true);
                    }
                  }}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {hasExistingKey && !keyEdited && (
                <p className="text-xs text-muted-foreground">
                  API key is saved. Re-enter it to update.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Generate at n8n → Settings → API → Create API Key.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? <><Loader2 className="size-4 animate-spin" /> Saving...</> : 'Save Configuration'}
          </Button>
          {(webhookUrl || apiUrl || hasExistingKey) && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? <><Loader2 className="size-4 animate-spin" /> Resetting...</> : <><RotateCcw className="size-4" /> Reset</>}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
