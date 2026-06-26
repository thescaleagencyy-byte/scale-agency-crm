'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, Workflow, ChevronUp, ChevronDown, Trash2, X, Eye, Code, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type ComponentType = 'TextInput' | 'Dropdown' | 'RadioButtonsGroup' | 'DatePicker' | 'CheckboxGroup' | 'TextBody' | 'Footer';

interface FlowComponent {
  type: ComponentType;
  name: string;
  label: string;
  required?: boolean;
  options?: string[];
}

interface FlowScreen {
  id: string;
  title: string;
  components: FlowComponent[];
}

interface FlowDef {
  version: string;
  screens: FlowScreen[];
}

interface WaFlow {
  id: string;
  name: string;
  meta_flow_id: string | null;
  status: string;
  definition: FlowDef;
  created_at: string;
}

const COMPONENT_TYPES: { value: ComponentType; label: string }[] = [
  { value: 'TextInput', label: 'Text Input' },
  { value: 'Dropdown', label: 'Dropdown' },
  { value: 'RadioButtonsGroup', label: 'Radio Buttons' },
  { value: 'CheckboxGroup', label: 'Checkboxes' },
  { value: 'DatePicker', label: 'Date Picker' },
  { value: 'TextBody', label: 'Text / Heading' },
  { value: 'Footer', label: 'Submit Button' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  published: 'border-primary/30 bg-primary/10 text-primary',
  deprecated: 'border-red-500/30 bg-red-500/10 text-red-400',
};

function newScreen(idx: number): FlowScreen {
  return {
    id: `SCREEN_${idx}`,
    title: `Screen ${idx}`,
    components: [
      { type: 'Footer', name: 'submit', label: 'Submit', required: false },
    ],
  };
}

function buildMetaJson(def: FlowDef): object {
  return {
    version: '3.0',
    screens: def.screens.map((s, si) => ({
      id: s.id,
      title: s.title,
      terminal: si === def.screens.length - 1,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'flow_path',
            children: s.components.map(c => {
              const base: Record<string, unknown> = { type: c.type, label: c.label, name: c.name };
              if (c.required !== undefined && c.type !== 'TextBody' && c.type !== 'Footer') base.required = c.required;
              if ((c.type === 'Dropdown' || c.type === 'RadioButtonsGroup' || c.type === 'CheckboxGroup') && c.options?.length) {
                base['data-source'] = c.options.map((o, i) => ({ id: String(i), title: o }));
              }
              if (c.type === 'Footer') {
                base['on-click-action'] = {
                  name: si === def.screens.length - 1 ? 'complete' : 'navigate',
                  next: si < def.screens.length - 1 ? { type: 'screen', name: def.screens[si + 1].id } : undefined,
                  payload: {},
                };
              }
              return base;
            }),
          },
        ],
      },
    })),
  };
}

export default function FlowsBuilderPage() {
  const { accountId } = useAuth();
  const [flows, setFlows] = useState<WaFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFlow, setActiveFlow] = useState<WaFlow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [activeScreen, setActiveScreen] = useState(0);

  async function load() {
    const db = createClient();
    const { data } = await db.from('whatsapp_flows').select('*').order('created_at', { ascending: false });
    setFlows((data ?? []) as WaFlow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createFlow(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !newName.trim()) return;
    setCreating(true);
    const db = createClient();
    const def: FlowDef = { version: '3.0', screens: [newScreen(1)] };
    const { data, error } = await db.from('whatsapp_flows').insert({ account_id: accountId, name: newName.trim(), definition: def }).select().single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setNewName('');
    setShowCreate(false);
    setFlows(prev => [data as WaFlow, ...prev]);
    setActiveFlow(data as WaFlow);
    setActiveScreen(0);
  }

  async function saveFlow(flow: WaFlow) {
    setSaving(true);
    const db = createClient();
    const { error } = await db.from('whatsapp_flows').update({ definition: flow.definition, updated_at: new Date().toISOString() }).eq('id', flow.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setFlows(prev => prev.map(f => f.id === flow.id ? flow : f));
    toast.success('Saved');
  }

  async function deleteFlow(id: string) {
    const db = createClient();
    await db.from('whatsapp_flows').delete().eq('id', id);
    setFlows(prev => prev.filter(f => f.id !== id));
    if (activeFlow?.id === id) setActiveFlow(null);
    toast.success('Deleted');
  }

  function updateScreen(si: number, patch: Partial<FlowScreen>) {
    if (!activeFlow) return;
    const screens = activeFlow.definition.screens.map((s, i) => i === si ? { ...s, ...patch } : s);
    setActiveFlow({ ...activeFlow, definition: { ...activeFlow.definition, screens } });
  }

  function addScreen() {
    if (!activeFlow) return;
    const screens = [...activeFlow.definition.screens, newScreen(activeFlow.definition.screens.length + 1)];
    setActiveFlow({ ...activeFlow, definition: { ...activeFlow.definition, screens } });
    setActiveScreen(screens.length - 1);
  }

  function removeScreen(si: number) {
    if (!activeFlow || activeFlow.definition.screens.length <= 1) return;
    const screens = activeFlow.definition.screens.filter((_, i) => i !== si);
    setActiveFlow({ ...activeFlow, definition: { ...activeFlow.definition, screens } });
    setActiveScreen(Math.max(0, si - 1));
  }

  function addComponent(si: number) {
    const s = activeFlow?.definition.screens[si];
    if (!s) return;
    const newComp: FlowComponent = { type: 'TextInput', name: `field_${Date.now()}`, label: 'New Field', required: true };
    const withoutFooter = s.components.filter(c => c.type !== 'Footer');
    const footer = s.components.find(c => c.type === 'Footer') ?? { type: 'Footer' as ComponentType, name: 'submit', label: 'Submit' };
    updateScreen(si, { components: [...withoutFooter, newComp, footer] });
  }

  function updateComponent(si: number, ci: number, patch: Partial<FlowComponent>) {
    const s = activeFlow?.definition.screens[si];
    if (!s) return;
    updateScreen(si, { components: s.components.map((c, i) => i === ci ? { ...c, ...patch } : c) });
  }

  function removeComponent(si: number, ci: number) {
    const s = activeFlow?.definition.screens[si];
    if (!s) return;
    updateScreen(si, { components: s.components.filter((_, i) => i !== ci) });
  }

  function moveComponent(si: number, ci: number, dir: -1 | 1) {
    const s = activeFlow?.definition.screens[si];
    if (!s) return;
    const comps = [...s.components];
    const target = ci + dir;
    if (target < 0 || target >= comps.length) return;
    [comps[ci], comps[target]] = [comps[target], comps[ci]];
    updateScreen(si, { components: comps });
  }

  const screen = activeFlow?.definition.screens[activeScreen];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Flow list */}
      <div className="w-72 shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">WA Flows</h1>
          <Button size="sm" onClick={() => setShowCreate(v => !v)} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />New
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Build WhatsApp Flow forms. Collect structured customer data inside WhatsApp.</p>

        {showCreate && (
          <form onSubmit={createFlow} className="flex gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Flow name..." autoFocus className="border-border bg-muted text-foreground text-xs h-9 flex-1" />
            <Button type="submit" disabled={creating || !newName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 shrink-0">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
            </Button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-1 flex-1 overflow-y-auto">
            {flows.map(f => (
              <div
                key={f.id}
                onClick={() => { setActiveFlow(f); setActiveScreen(0); }}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors group',
                  activeFlow?.id === f.id ? 'border-primary/30 bg-primary/10' : 'border-border bg-card hover:bg-muted'
                )}
              >
                <Workflow className={cn('h-4 w-4 shrink-0', activeFlow?.id === f.id ? 'text-primary' : 'text-muted-foreground')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium truncate', activeFlow?.id === f.id ? 'text-primary' : 'text-foreground')}>{f.name}</p>
                  <Badge variant="outline" className={cn('text-[10px] mt-0.5 capitalize', STATUS_COLORS[f.status] ?? '')}>{f.status}</Badge>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteFlow(f.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {flows.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No flows yet</p>
            )}
          </div>
        )}
      </div>

      {/* Builder */}
      {activeFlow ? (
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{activeFlow.name}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowJson(v => !v)}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors', showJson ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
              >
                <Code className="h-3.5 w-3.5" />{showJson ? 'Hide' : 'Show'} JSON
              </button>
              <Button
                size="sm"
                disabled={saving}
                onClick={() => saveFlow(activeFlow)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Save
              </Button>
            </div>
          </div>

          {showJson ? (
            <div className="flex-1 rounded-xl border border-border bg-muted/50 p-4 overflow-auto">
              <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap">
                {JSON.stringify(buildMetaJson(activeFlow.definition), null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex-1 flex gap-3 min-h-0">
              {/* Screen tabs */}
              <div className="w-36 shrink-0 flex flex-col gap-1">
                {activeFlow.definition.screens.map((s, si) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveScreen(si)}
                      className={cn(
                        'flex-1 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                        activeScreen === si ? 'border-primary/30 bg-primary/10 text-primary font-semibold' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {s.title || `Screen ${si + 1}`}
                    </button>
                    {activeFlow.definition.screens.length > 1 && (
                      <button onClick={() => removeScreen(si)} className="text-muted-foreground hover:text-red-400">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addScreen}
                  className="mt-1 flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                >
                  <Plus className="h-3 w-3" />Add screen
                </button>
              </div>

              {/* Screen editor */}
              {screen && (
                <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Screen title</Label>
                    <Input
                      value={screen.title}
                      onChange={e => updateScreen(activeScreen, { title: e.target.value })}
                      className="border-border bg-muted text-foreground text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Components ({screen.components.length})</Label>
                      <button onClick={() => addComponent(activeScreen)} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                        <Plus className="h-3 w-3" />Add field
                      </button>
                    </div>

                    {screen.components.map((c, ci) => (
                      <div key={ci} className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={c.type}
                            onChange={e => updateComponent(activeScreen, ci, { type: e.target.value as ComponentType })}
                            className="h-8 rounded-lg border border-border bg-muted text-foreground text-xs px-2 flex-1"
                          >
                            {COMPONENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => moveComponent(activeScreen, ci, -1)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground"><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button onClick={() => moveComponent(activeScreen, ci, 1)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5" /></button>
                            <button onClick={() => removeComponent(activeScreen, ci)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Label</Label>
                            <Input
                              value={c.label}
                              onChange={e => updateComponent(activeScreen, ci, { label: e.target.value })}
                              className="border-border bg-muted text-foreground text-xs h-8"
                            />
                          </div>
                          {c.type !== 'TextBody' && c.type !== 'Footer' && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Field name (no spaces)</Label>
                              <Input
                                value={c.name}
                                onChange={e => updateComponent(activeScreen, ci, { name: e.target.value.replace(/\s/g, '_') })}
                                className="border-border bg-muted text-foreground text-xs h-8"
                              />
                            </div>
                          )}
                        </div>

                        {(c.type === 'Dropdown' || c.type === 'RadioButtonsGroup' || c.type === 'CheckboxGroup') && (
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Options (one per line)</Label>
                            <textarea
                              value={(c.options ?? []).join('\n')}
                              onChange={e => updateComponent(activeScreen, ci, { options: e.target.value.split('\n').filter(Boolean) })}
                              rows={3}
                              className="w-full resize-none rounded-lg border border-border bg-muted text-foreground text-xs px-3 py-2"
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                            />
                          </div>
                        )}

                        {c.type !== 'TextBody' && c.type !== 'Footer' && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={c.required ?? false}
                              onChange={e => updateComponent(activeScreen, ci, { required: e.target.checked })}
                              className="accent-primary"
                            />
                            <span className="text-[10px] text-muted-foreground">Required field</span>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border">
          <Workflow className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Select or create a flow to start building</p>
          <p className="text-xs text-muted-foreground max-w-xs text-center">WhatsApp Flows let customers fill out forms, surveys, or bookings — all inside WhatsApp.</p>
        </div>
      )}
    </div>
  );
}
