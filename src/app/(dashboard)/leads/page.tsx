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
  StickyNote, Bell, CheckSquare, Square,
} from 'lucide-react';
import { LeadNotesPanel } from '@/components/leads/lead-notes-panel';
import { ReminderDialog } from '@/components/reminders/reminder-dialog';
import type { Lead } from '@/types';

const STATUS_LABEL: Record<string, string> = { new: 'New', called: 'Called', won: 'Won', lost: 'Lost' };
const STATUS_CLASS: Record<string, string> = {
  new:    'bg-blue-500/15 text-blue-600 border-blue-500/30',
  called: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  won:    'bg-green-500/15 text-green-600 border-green-500/30',
  lost:   'bg-red-500/15 text-red-600 border-red-500/30',
};
const STATUSES = ['new', 'called', 'won', 'lost'] as const;
type LeadStatus = typeof STATUSES[number];
const PAGE_SIZE = 25;

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-500/15 text-green-600 border-green-500/30' :
    score >= 50 ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' :
                  'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      {score}
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

  const [notesLead, setNotesLead] = useState<Lead | null>(null);
  const [reminderLead, setReminderLead] = useState<Lead | null>(null);

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
      if (search.trim()) {
        query = query.or(
          `customer_name.ilike.%${search.trim()}%,customer_phone.ilike.%${search.trim()}%,company.ilike.%${search.trim()}%`
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
  }, [page, search, filterStatus]);

  useEffect(() => { load(); }, [load]);

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
      toast.success(`Marked ${STATUS_LABEL[status]}`);
    }
    setUpdating(null);
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
        <div className="flex gap-1">
          {(['all', ...STATUSES] as string[]).map(s => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(0); }}
              className={[
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

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

      <div className="rounded-lg border border-border overflow-hidden">
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
                <TableHead className="text-muted-foreground">Score</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(lead => (
                <TableRow key={lead.id} className={`border-border ${selected.has(lead.id) ? 'bg-primary/5' : ''}`}>
                  <TableCell>
                    <button onClick={() => toggleSelect(lead.id)} className="text-muted-foreground hover:text-foreground">
                      {selected.has(lead.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">{lead.customer_name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{lead.customer_phone}</div>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{lead.service_type ?? '—'}</TableCell>
                  <TableCell className="text-sm text-foreground">{lead.project_site ?? '—'}</TableCell>
                  <TableCell className="text-sm text-foreground">{lead.duration ?? '—'}</TableCell>
                  <TableCell className="text-sm text-foreground">{lead.company ?? '—'}</TableCell>
                  <TableCell><ScoreBadge score={lead.score ?? 0} /></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_CLASS[lead.status] ?? ''}`}>
                      {STATUS_LABEL[lead.status] ?? lead.status}
                    </Badge>
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
