'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, Route, Trash2, X, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import { SettingsPanelHead } from './settings-panel-head';
import { cn } from '@/lib/utils';

interface Condition {
  type: 'keyword' | 'time_of_day' | 'language';
  value: string;
  operator?: 'contains' | 'equals';
}

interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: Condition[];
  assign_to_agent_id: string | null;
  agent_name?: string;
}

interface Agent {
  user_id: string;
  full_name: string | null;
}

const CONDITION_TYPES = [
  { value: 'keyword', label: 'First message contains keyword' },
  { value: 'time_of_day', label: 'Time of day (hour range, 24h)' },
  { value: 'language', label: 'Message language' },
];

export function RoutingRulesPanel() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [ruleName, setRuleName] = useState('');
  const [ruleAgent, setRuleAgent] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([{ type: 'keyword', value: '', operator: 'contains' }]);

  async function load() {
    const db = createClient();
    const [rulesRes, agentsRes] = await Promise.all([
      db.from('routing_rules').select('*, agent:profiles(full_name)').order('priority'),
      db.from('profiles').select('user_id, full_name').limit(50),
    ]);

    const mapped = (rulesRes.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      priority: r.priority as number,
      enabled: r.enabled as boolean,
      conditions: r.conditions as Condition[],
      assign_to_agent_id: r.assign_to_agent_id as string | null,
      agent_name: (r.agent as { full_name?: string } | null)?.full_name ?? undefined,
    }));
    setRules(mapped);
    setAgents((agentsRes.data ?? []) as Agent[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function addCondition() {
    setConditions(prev => [...prev, { type: 'keyword', value: '', operator: 'contains' }]);
  }

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleName.trim() || conditions.some(c => !c.value.trim())) {
      toast.error('Fill all condition values');
      return;
    }
    setSaving(true);
    const db = createClient();
    const { error } = await db.from('routing_rules').insert({
      name: ruleName.trim(),
      conditions,
      assign_to_agent_id: ruleAgent || null,
      priority: rules.length,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Routing rule created');
    setRuleName(''); setRuleAgent('');
    setConditions([{ type: 'keyword', value: '', operator: 'contains' }]);
    setShowForm(false);
    load();
  }

  async function del(id: string) {
    const db = createClient();
    await db.from('routing_rules').delete().eq('id', id);
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success('Deleted');
  }

  async function toggleEnabled(rule: RoutingRule) {
    const db = createClient();
    await db.from('routing_rules').update({ enabled: !rule.enabled }).eq('id', rule.id);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
  }

  function describeCondition(c: Condition): string {
    if (c.type === 'keyword') return `message ${c.operator ?? 'contains'} "${c.value}"`;
    if (c.type === 'time_of_day') return `hour is ${c.value}`;
    if (c.type === 'language') return `language is ${c.value}`;
    return c.value;
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Skills-Based Routing"
        description="Auto-assign new conversations based on message content, time, or language. Rules run in priority order on every new conversation."
      />

      <div className="flex justify-end">
        <Button onClick={() => setShowForm(v => !v)} variant="outline" className="border-border bg-transparent text-muted-foreground hover:text-foreground text-sm">
          <Plus className="h-4 w-4 mr-1.5" />Add Rule
        </Button>
      </div>

      {showForm && (
        <form onSubmit={save} className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">New Routing Rule</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rule name</Label>
            <Input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. Route crane inquiries to Ahmad" required className="border-border bg-muted text-foreground" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Conditions (ALL must match)</Label>
              <button type="button" onClick={addCondition} className="text-xs text-primary hover:text-primary/80">+ Add condition</button>
            </div>
            {conditions.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <select
                  value={c.type}
                  onChange={e => updateCondition(i, { type: e.target.value as Condition['type'], value: '' })}
                  className="h-9 rounded-lg border border-border bg-muted text-foreground text-xs px-2 shrink-0"
                >
                  {CONDITION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {c.type === 'keyword' && (
                  <>
                    <select
                      value={c.operator ?? 'contains'}
                      onChange={e => updateCondition(i, { operator: e.target.value as 'contains' | 'equals' })}
                      className="h-9 rounded-lg border border-border bg-muted text-foreground text-xs px-2 shrink-0"
                    >
                      <option value="contains">contains</option>
                      <option value="equals">equals</option>
                    </select>
                    <Input value={c.value} onChange={e => updateCondition(i, { value: e.target.value })} placeholder="crane, excavator..." className="border-border bg-muted text-foreground text-xs h-9 flex-1" />
                  </>
                )}
                {c.type === 'time_of_day' && (
                  <Input value={c.value} onChange={e => updateCondition(i, { value: e.target.value })} placeholder="9-17 (9am–5pm)" className="border-border bg-muted text-foreground text-xs h-9 flex-1" />
                )}
                {c.type === 'language' && (
                  <Input value={c.value} onChange={e => updateCondition(i, { value: e.target.value })} placeholder="arabic, english, urdu..." className="border-border bg-muted text-foreground text-xs h-9 flex-1" />
                )}
                {conditions.length > 1 && (
                  <button type="button" onClick={() => removeCondition(i)} className="h-9 w-9 shrink-0 flex items-center justify-center text-muted-foreground hover:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assign to agent (optional — leave blank to only tag, not assign)</Label>
            <select value={ruleAgent} onChange={e => setRuleAgent(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-muted text-foreground text-sm px-3">
              <option value="">— No assignment (just match) —</option>
              {agents.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name ?? a.user_id}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Route className="h-4 w-4 mr-1.5" />Save Rule</>}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Route className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No routing rules. All conversations come in unassigned.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r, idx) => (
            <div key={r.id} className={cn(
              'flex items-start gap-3 rounded-xl border p-4 transition-colors',
              r.enabled ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60'
            )}>
              <div className="flex h-6 w-6 items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.conditions.map((c, ci) => (
                    <span key={ci} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {describeCondition(c)}
                    </span>
                  ))}
                </div>
                {r.agent_name && (
                  <p className="mt-1.5 text-xs text-muted-foreground">→ Assign to <span className="font-medium text-foreground">{r.agent_name}</span></p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleEnabled(r)} title={r.enabled ? 'Disable' : 'Enable'} className="text-muted-foreground hover:text-primary transition-colors">
                  {r.enabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-foreground mb-2">How routing works</p>
        <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
          <li>Rules run in order (1, 2, 3…) when a new conversation starts</li>
          <li>First rule that matches wins — remaining rules are skipped</li>
          <li>Keyword conditions check the customer&apos;s first message</li>
          <li>Time of day uses the server&apos;s UTC clock — offset for your timezone</li>
          <li>Language detection is based on first message character set</li>
        </ul>
      </div>
    </div>
  );
}
