'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPanelHead } from './settings-panel-head';
import { Plus, Loader2, Building2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Workspace {
  account_id: string;
  role: string;
  account: { id: string; name: string } | null;
}

export function WorkspacesPanel() {
  const { profile } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  async function load() {
    const db = createClient();
    const { data } = await db
      .from('account_memberships')
      .select('account_id, role, account:accounts(id, name)')
      .order('created_at');
    setWorkspaces((data ?? []) as unknown as Workspace[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const db = createClient();
    const { error } = await db.rpc('create_workspace', { workspace_name: newName.trim() });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Workspace "${newName}" created`);
    setNewName('');
    load();
  }

  async function switchWorkspace(accountId: string) {
    if (accountId === profile?.account_id) return;
    setSwitching(accountId);
    const db = createClient();
    const { error } = await db.rpc('switch_workspace', { target_account_id: accountId });
    if (error) { toast.error(error.message); setSwitching(null); return; }
    toast.success('Switched — reloading...');
    setTimeout(() => window.location.reload(), 800);
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Workspaces"
        description="Manage multiple business workspaces. Each workspace has its own contacts, deals, and WhatsApp number."
      />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {workspaces.map(w => {
            const acc = Array.isArray(w.account) ? w.account[0] : w.account;
            const isActive = acc?.id === profile?.account_id;
            return (
              <div key={w.account_id} className={cn(
                'flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors',
                isActive ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
              )}>
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  isActive ? 'bg-primary/10' : 'bg-muted'
                )}>
                  <Building2 className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{acc?.name ?? 'Untitled workspace'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{w.role}</p>
                </div>
                {isActive ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Check className="h-3.5 w-3.5" />Active
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => switchWorkspace(acc?.id ?? '')}
                    disabled={switching === acc?.id}
                    className="border-border bg-transparent text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {switching === acc?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Switch'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={createWorkspace} className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Create new workspace</p>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Workspace name</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Acme Corp, Personal Projects..."
              className="border-border bg-muted text-foreground"
            />
          </div>
          <Button type="submit" disabled={creating || !newName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1.5" />Create</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Each workspace is isolated — separate contacts, deals, inbox, and WhatsApp config.</p>
      </form>
    </div>
  );
}
