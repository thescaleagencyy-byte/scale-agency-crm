'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Plug, ExternalLink, Check, Clock, X } from 'lucide-react';
import { CATEGORY_LABEL, type IntegrationCategory, type CredentialField } from '@/lib/integrations-catalog';

interface IntegrationRow {
  service: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  docsHint: string;
  managedElsewhere?: { table: string; settingsHref: string };
  credentialFields?: CredentialField[];
  status: 'not_connected' | 'pending' | 'connected' | 'error';
  connected_at: string | null;
  last_error: string | null;
}

const STATUS_META: Record<string, { label: string; className: string; Icon: typeof Check }> = {
  connected: { label: 'Connected', className: 'bg-green-500/15 text-green-600 border-green-500/30', Icon: Check },
  pending: { label: 'Key saved, unverified', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30', Icon: Clock },
  not_connected: { label: 'Not connected', className: 'bg-muted text-muted-foreground border-border', Icon: X },
  error: { label: 'Error', className: 'bg-red-500/15 text-red-600 border-red-500/30', Icon: X },
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openService, setOpenService] = useState<string | null>(null);
  const [credential, setCredential] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      if (data.integrations) setIntegrations(data.integrations);
      else toast.error(data.error || 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connect = async (row: IntegrationRow) => {
    const hasFields = !!row.credentialFields?.length;
    if (hasFields) {
      const missing = row.credentialFields!.filter((f) => !fieldValues[f.key]?.trim());
      if (missing.length > 0) {
        toast.error(`${missing.map((f) => f.label).join(', ')} required.`);
        return;
      }
    } else if (!credential.trim()) {
      toast.error('Paste a credential first.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasFields ? { service: row.service, fields: fieldValues } : { service: row.service, credential }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.status === 'connected') toast.success('Verified and connected — checked live against the real API.');
        else if (data.status === 'error') toast.error(`Saved, but verification failed: ${data.error}`);
        else toast.success('Credential saved (encrypted) — marked pending, no live verification available for this service yet.');
        setOpenService(null);
        setCredential('');
        setFieldValues({});
        load();
      } else {
        toast.error(data.error || 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  };

  const grouped = integrations.reduce<Record<string, IntegrationRow[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integration Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where Scale OS connects to everything else. Honest statuses only — nothing shows &quot;Connected&quot; without a real link proving it.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading integrations...</span>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {CATEGORY_LABEL[category as IntegrationCategory] ?? category}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((i) => {
                const meta = STATUS_META[i.status] ?? STATUS_META.not_connected;
                return (
                  <div key={i.service} className="card-elevated p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <Plug className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{i.name}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
                        <meta.Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{i.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{i.docsHint}</p>
                    {i.status === 'error' && i.last_error && (
                      <p className="mt-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-500">{i.last_error}</p>
                    )}

                    <div className="mt-3">
                      {i.managedElsewhere ? (
                        <Link
                          href={i.managedElsewhere.settingsHref}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Manage in Settings
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : openService === i.service ? (
                        <div className="space-y-2">
                          {i.credentialFields?.length ? (
                            i.credentialFields.map((f) => (
                              <input
                                key={f.key}
                                type="password"
                                value={fieldValues[f.key] ?? ''}
                                onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                placeholder={f.placeholder}
                                aria-label={f.label}
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                              />
                            ))
                          ) : (
                            <input
                              type="password"
                              value={credential}
                              onChange={(e) => setCredential(e.target.value)}
                              placeholder="Paste API key / token..."
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                            />
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => connect(i)}
                              className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpenService(null); setCredential(''); setFieldValues({}); }}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenService(i.service)}
                          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                        >
                          {i.status === 'not_connected' ? 'Connect' : 'Update credential'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
