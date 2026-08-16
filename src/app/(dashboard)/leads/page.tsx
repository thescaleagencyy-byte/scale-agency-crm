'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, ChevronLeft, ChevronRight, MoreHorizontal, TrendingUp, Loader2,
  StickyNote, Bell, CheckSquare, Square, Sparkles,
} from 'lucide-react';
import { AvatarStack } from '@/components/ui/avatar-stack';
import { LeadDetailPanel } from '@/components/leads/lead-detail-panel';
import { LeadNotesPanel } from '@/components/leads/lead-notes-panel';
import { ReminderDialog } from '@/components/reminders/reminder-dialog';
import { getLeadStatuses } from '@/lib/lead-status-terms';
import type { Lead } from '@/types';

type LeadStatus = Lead['status'];
const LEAD_STATUSES = getLeadStatuses();
const STATUS_LABEL: Record<string, string> = Object.fromEntries(LEAD_STATUSES.map(s => [s.id, s.label]));
const STATUS_CLASS: Record<string, string> = Object.fromEntries(LEAD_STATUSES.map(s => [s.id, s.className]));
const STATUSES = LEAD_STATUSES.map(s => s.id as LeadStatus);
const PAGE_SIZE = 25;

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-500/15 text-green-600 border-green-500/30' :
    score >= 50 ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' :
                  'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex h-5 w-fit items-center justify-center rounded-4xl border px-2 py-0.5 text-xs font-medium ${color}`}>
      {score}
    </span>
  );
}

// Real intent read from the conversation (see /api/leads/triage) —
// separate from ScoreBadge, which is just the has_name/has_company
// point count and rates spam the same as a genuine buyer if neither
// filled in a "company" field.
const QUALITY_STYLE: Record<string, string> = {
  hot: 'bg-red-500/15 text-red-600 border-red-500/30',
  warm: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  cold: 'bg-muted text-muted-foreground border-border',
};
function QualityBadge({ quality, summary }: { quality: string | null; summary: string | null }) {
  if (!quality) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      title={summary ?? undefined}
      className={`inline-flex h-5 w-fit items-center justify-center rounded-4xl border px-2 py-0.5 text-xs font-medium capitalize ${QUALITY_STYLE[quality] ?? QUALITY_STYLE.cold}`}
    >
      {quality}
    </span>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [triaging, setTriaging] = useState(false);

  const [notesLead, setNotesLead] = useState<Lead | null>(null);
  const [reminderLead, setReminderLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // "Assigned to" comes from the linked conversation, not the lead row
  // itself — leads have no assignee column of their own, they inherit
  // whoever owns the conversation (see auto-assign in message-thread.tsx).
  const [agentNameByUserId, setAgentNameByUserId] = useState<Record<string, string>>({});
  const [assigneeByConversationId, setAssigneeByConversationId] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('user_id, full_name')
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load profiles:', error); return; }
        setAgentNameByUserId(Object.fromEntries((data ?? []).map(p => [p.user_id, p.full_name])));
      });
  }, []);

  // Debounce: search fires a Supabase query per change; typing "ahmed"
  // shouldn't issue five queries. 300ms after the last keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        // PostgREST or() filters treat , ( ) as syntax — strip them so a
        // search like "Khan (Lahore)" errors out instead of matching.
        // % and _ are LIKE wildcards; escape so they match literally.
        const term = debouncedSearch
          .trim()
          .replace(/[,()]/g, ' ')
          .replace(/[%_]/g, '\\$&');
        query = query.or(
          `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,company.ilike.%${term}%`
        );
      }

      const { data, count, error } = await query;
      if (error) toast.error(error.message);
      else { setLeads((data as Lead[]) ?? []); setTotal(count ?? 0); }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const conversationIds = Array.from(
      new Set(leads.map(l => l.conversation_id).filter((id): id is string => !!id))
    );
    if (conversationIds.length === 0) { setAssigneeByConversationId({}); return; }
    const supabase = createClient();
    supabase
      .from('conversations')
      .select('id, assigned_agent_id')
      .in('id', conversationIds)
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load conversation assignees:', error); return; }
        setAssigneeByConversationId(
          Object.fromEntries((data ?? []).map(c => [c.id, c.assigned_agent_id ?? null]))
        );
      });
  }, [leads]);

  async function updateStatus(id: string, status: LeadStatus) {
    setUpdating(id);
    const supabase = createClient();
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast.error('Update failed');
    else {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
      setSelectedLead(prev => prev && prev.id === id ? { ...prev, status } : prev);
      toast.success(`Marked ${STATUS_LABEL[status]}`);
    }
    setUpdating(null);
  }

  // Leads had no edit path at all before this — confirmed a real gap
  // during the 2026-08-16 audit (4 CRM leads with garbage `company`
  // values needed a raw DB script to fix, since neither this page nor
  // any API route could touch the field). Same session-scoped update
  // pattern as updateStatus, just parameterized over the field name.
  async function updateLeadField(id: string, field: 'company' | 'customer_name', value: string) {
    const supabase = createClient();
    const trimmed = value.trim();
    const { error } = await supabase
      .from('leads')
      .update({ [field]: trimmed || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [field]: trimmed || null } : l));
    setSelectedLead(prev => prev && prev.id === id ? { ...prev, [field]: trimmed || null } : prev);
    toast.success('Saved');
  }

  async function bulkUpdateStatus(status: LeadStatus) {
    if (!selected.size) return;
    setBulkUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', Array.from(selected));
    setBulkUpdating(false);
    if (error) { toast.error('Bulk update failed'); return; }
    toast.success(`${selected.size} leads marked ${STATUS_LABEL[status]}`);
    setSelected(new Set());
    load();
  }

  async function triageNewLeads() {
    setTriaging(true);
    try {
      const res = await fetch('/api/leads/triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Triage failed'); return; }
      if (data.triaged === 0) toast('No untriaged leads to analyze');
      else { toast.success(`Analyzed ${data.triaged} lead${data.triaged === 1 ? '' : 's'}`); load(); }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTriaging(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = leads.length > 0 && selected.size === leads.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">{total} qualified leads captured</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground w-64"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          {(['all', ...STATUSES] as string[]).map(s => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(0); }}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filterStatus === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {selected.size === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={triageNewLeads}
            disabled={triaging}
            className="gap-1.5 text-xs"
            title="Read each untriaged lead's conversation and judge real buying intent — separate from the Score column, which only counts filled-in fields"
          >
            {triaging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analyze new leads
          </Button>
        )}

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => bulkUpdateStatus(s)}
                disabled={bulkUpdating}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                {bulkUpdating ? <Loader2 className="h-3 w-3 animate-spin inline" /> : `→ ${STATUS_LABEL[s]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className={`panel-float overflow-hidden ${selectedLead ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading leads...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No leads yet</p>
            <p className="text-xs text-muted-foreground">Leads from qualified WhatsApp conversations appear here</p>
          </div>
        ) : (
          // p-1.5 wrapper: the table's header border/checkbox otherwise sit
          // flush against panel-float's rounded corner with zero gap, so
          // overflow-hidden clips the straight border line at a shallow
          // tangent to the arc — renders as a fuzzy, irregular corner
          // instead of a clean curve. A small inset fixes it.
          <div className="p-1.5">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-8">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </TableHead>
                <TableHead className="text-muted-foreground">Customer</TableHead>
                <TableHead className="text-muted-foreground">Service</TableHead>
                <TableHead className="text-muted-foreground">Site</TableHead>
                <TableHead className="text-muted-foreground">Duration</TableHead>
                <TableHead className="text-muted-foreground">Company</TableHead>
                <TableHead className="text-muted-foreground">Source</TableHead>
                <TableHead className="text-muted-foreground">Score</TableHead>
                <TableHead className="text-muted-foreground">AI Quality</TableHead>
                <TableHead className="text-muted-foreground">Assigned to</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(lead => (
                <TableRow
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`cursor-pointer border-border ${selected.has(lead.id) || selectedLead?.id === lead.id ? 'bg-primary/5' : ''}`}
                >
                  <TableCell>
                    <button onClick={() => toggleSelect(lead.id)} className="text-muted-foreground hover:text-foreground">
                      {selected.has(lead.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <AvatarStack avatars={[{ label: lead.customer_name || lead.customer_phone || '?' }]} size="md" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{lead.customer_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{lead.customer_phone}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{lead.service_type ?? '—'}</TableCell>
                  <TableCell className="text-sm text-foreground">{lead.project_site ?? '—'}</TableCell>
                  <TableCell className="text-sm text-foreground">{lead.duration ?? '—'}</TableCell>
                  <TableCell className="text-sm text-foreground">{lead.company ?? '—'}</TableCell>
                  <TableCell>
                    {lead.source ? (
                      <span className="inline-flex h-5 w-fit items-center justify-center rounded-4xl border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                        {lead.source.replace(/_/g, ' ')}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><ScoreBadge score={lead.score ?? 0} /></TableCell>
                  <TableCell><QualityBadge quality={lead.ai_quality} summary={lead.ai_summary} /></TableCell>
                  <TableCell>
                    {(() => {
                      const agentUserId = lead.conversation_id
                        ? assigneeByConversationId[lead.conversation_id]
                        : null;
                      const agentName = agentUserId ? agentNameByUserId[agentUserId] : null;
                      return agentName ? (
                        <div className="flex items-center gap-2">
                          <AvatarStack avatars={[{ label: agentName }]} size="sm" />
                          <span className="text-sm text-foreground">{agentName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${STATUS_CLASS[lead.status] ?? ''}`}>
                        {STATUS_LABEL[lead.status] ?? lead.status}
                      </Badge>
                      {lead.status === 'new' && Date.now() - new Date(lead.created_at).getTime() > 3 * 86400000 && (
                        <span
                          title="No contact in 3+ days"
                          className="inline-flex h-5 w-fit items-center justify-center rounded-4xl border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-600"
                        >
                          🥶 Going cold
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setNotesLead(lead)}
                        className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Notes"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setReminderLead(lead)}
                        className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Set reminder"
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                          {updating === lead.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <MoreHorizontal className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {STATUSES.filter(s => s !== lead.status).map(s => (
                            <DropdownMenuItem key={s} onClick={() => updateStatus(lead.id, s)}>
                              Mark as {STATUS_LABEL[s]}
                            </DropdownMenuItem>
                          ))}
                          {lead.conversation_id && (
                            <DropdownMenuItem onClick={() => { window.location.href = `/inbox?c=${lead.conversation_id}`; }}>
                              View conversation
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </div>

      {selectedLead && (
        <div className="lg:col-span-2">
          <LeadDetailPanel
            lead={selectedLead}
            statusLabel={STATUS_LABEL}
            statusClass={STATUS_CLASS}
            statuses={STATUSES}
            updating={updating === selectedLead.id}
            onClose={() => setSelectedLead(null)}
            onStatusChange={(s) => updateStatus(selectedLead.id, s)}
            onOpenNotes={() => setNotesLead(selectedLead)}
            onOpenReminder={() => setReminderLead(selectedLead)}
            onFieldChange={(field, value) => updateLeadField(selectedLead.id, field, value)}
          />
        </div>
      )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {notesLead && (
        <LeadNotesPanel lead={notesLead} onClose={() => setNotesLead(null)} />
      )}
      {reminderLead && (
        <ReminderDialog
          entityType="lead"
          entityId={reminderLead.id}
          entityLabel={reminderLead.customer_name ?? reminderLead.customer_phone}
          onClose={() => setReminderLead(null)}
        />
      )}
    </div>
  );
}
