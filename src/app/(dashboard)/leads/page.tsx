'use client';

import { useState, useEffect } from 'react';
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
import { Search, ChevronLeft, ChevronRight, MoreHorizontal, TrendingUp, Loader2 } from 'lucide-react';

interface Lead {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  service_type: string | null;
  project_site: string | null;
  duration: string | null;
  company: string | null;
  status: string;
  created_at: string;
  conversation_id: string | null;
}

const STATUS_LABEL: Record<string, string> = { new: 'New', called: 'Called', won: 'Won', lost: 'Lost' };
const STATUS_CLASS: Record<string, string> = {
  new:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  called: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  won:    'bg-green-500/15 text-green-400 border-green-500/30',
  lost:   'bg-red-500/15 text-red-400 border-red-500/30',
};
const STATUSES = ['new', 'called', 'won', 'lost'] as const;
type LeadStatus = typeof STATUSES[number];
const PAGE_SIZE = 25;

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        let query = supabase
          .from('leads')
          .select('id,customer_name,customer_phone,service_type,project_site,duration,company,status,created_at,conversation_id', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (filterStatus !== 'all') query = query.eq('status', filterStatus);
        if (search.trim()) {
          query = query.or(
            `customer_name.ilike.%${search.trim()}%,customer_phone.ilike.%${search.trim()}%,company.ilike.%${search.trim()}%`
          );
        }

        const { data, count, error } = await query;
        if (cancelled) return;
        if (error) toast.error(error.message);
        else { setLeads((data as Lead[]) ?? []); setTotal(count ?? 0); }
      } catch (e) {
        if (!cancelled) toast.error(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, search, filterStatus]);

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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-white/60" />
        <h1 className="text-xl font-semibold text-white">Leads</h1>
        <span className="text-sm text-white/40">{total} total</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 w-64 bg-white/5 border-white/10 text-white placeholder:text-white/30"
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
                  ? s === 'all' ? 'bg-white/15 text-white border-white/30' : STATUS_CLASS[s]
                  : 'text-white/50 border-white/10 hover:border-white/20 hover:text-white/70',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <TrendingUp className="h-8 w-8 text-white/20" />
            <p className="text-sm font-medium text-white/50">No leads yet</p>
            <p className="text-xs text-white/30">Qualified leads from Reem appear here</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/50">Customer</TableHead>
                <TableHead className="text-white/50">Service</TableHead>
                <TableHead className="text-white/50">Site</TableHead>
                <TableHead className="text-white/50">Duration</TableHead>
                <TableHead className="text-white/50">Company</TableHead>
                <TableHead className="text-white/50">Status</TableHead>
                <TableHead className="text-white/50">Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(lead => (
                <TableRow key={lead.id} className="border-white/5">
                  <TableCell>
                    <div className="text-sm font-medium text-white">{lead.customer_name ?? '—'}</div>
                    <div className="text-xs text-white/40">{lead.customer_phone}</div>
                  </TableCell>
                  <TableCell className="text-sm text-white/80">{lead.service_type ?? '—'}</TableCell>
                  <TableCell className="text-sm text-white/80">{lead.project_site ?? '—'}</TableCell>
                  <TableCell className="text-sm text-white/80">{lead.duration ?? '—'}</TableCell>
                  <TableCell className="text-sm text-white/80">{lead.company ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_CLASS[lead.status] ?? ''}`}>
                      {STATUS_LABEL[lead.status] ?? lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-white/40">
                    {new Date(lead.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-7 w-7 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/5">
                        {updating === lead.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <MoreHorizontal className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
                        {STATUSES.filter(s => s !== lead.status).map(s => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => updateStatus(lead.id, s)}
                            className="text-white/70 hover:text-white cursor-pointer"
                          >
                            Mark as {STATUS_LABEL[s]}
                          </DropdownMenuItem>
                        ))}
                        {lead.conversation_id && (
                          <DropdownMenuItem
                            onClick={() => { window.location.href = `/inbox?c=${lead.conversation_id}`; }}
                            className="text-white/70 hover:text-white cursor-pointer"
                          >
                            View conversation
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
