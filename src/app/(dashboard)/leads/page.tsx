'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, MoreHorizontal, TrendingUp } from 'lucide-react';

type LeadStatus = 'new' | 'called' | 'won' | 'lost';

interface Lead {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  service_type: string | null;
  project_site: string | null;
  duration: string | null;
  quantity: string | null;
  company: string | null;
  status: LeadStatus;
  created_at: string;
  conversation_id: string | null;
}

const STATUS_META: Record<LeadStatus, { label: string; className: string }> = {
  new:    { label: 'New',    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  called: { label: 'Called', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  won:    { label: 'Won',    className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  lost:   { label: 'Lost',   className: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const PAGE_SIZE = 25;
const ALL_STATUSES: LeadStatus[] = ['new', 'called', 'won', 'lost'];

export default function LeadsPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`customer_name.ilike.${s},customer_phone.ilike.${s},company.ilike.${s},service_type.ilike.${s},project_site.ilike.${s}`);
    }

    const { data, count, error } = await query;
    if (error) { toast.error('Failed to load leads'); setLoading(false); return; }
    setLeads((data as Lead[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search, filterStatus, supabase]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function updateStatus(id: string, status: LeadStatus) {
    setUpdating(id);
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('Failed to update status'); }
    else {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
      toast.success(`Lead marked as ${STATUS_META[status].label}`);
    }
    setUpdating(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Summary counts
  const counts = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp className="h-5 w-5 text-white/60" />
          <h1 className="text-lg font-semibold text-white">Leads</h1>
          <span className="text-sm text-white/40">{total} total</span>
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={() => { setFilterStatus('all'); setPage(0); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === 'all' ? 'bg-white/15 text-white border-white/30' : 'text-white/50 border-white/10 hover:border-white/20'}`}
          >
            All
          </button>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(0); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? STATUS_META[s].className : 'text-white/50 border-white/10 hover:border-white/20'}`}
            >
              {STATUS_META[s].label} {counts[s] ? `(${counts[s]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-white/10">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search by name, phone, company..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/40 text-sm">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <TrendingUp className="h-8 w-8 text-white/20" />
            <p className="text-white/40 text-sm">No leads yet</p>
            <p className="text-white/25 text-xs">Qualified leads from Reem will appear here</p>
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
                <TableRow key={lead.id} className="border-white/5 hover:bg-white/3">
                  <TableCell>
                    <div className="text-sm font-medium text-white">{lead.customer_name || '—'}</div>
                    <div className="text-xs text-white/40">{lead.customer_phone}</div>
                  </TableCell>
                  <TableCell className="text-sm text-white/80">{lead.service_type || '—'}</TableCell>
                  <TableCell className="text-sm text-white/80">{lead.project_site || '—'}</TableCell>
                  <TableCell className="text-sm text-white/80">{lead.duration || '—'}</TableCell>
                  <TableCell className="text-sm text-white/80">{lead.company || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_META[lead.status as LeadStatus]?.className}`}>
                      {STATUS_META[lead.status as LeadStatus]?.label ?? lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-white/40">
                    {new Date(lead.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-7 w-7 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-50" disabled={updating === lead.id}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10">
                        {ALL_STATUSES.filter(s => s !== lead.status).map(s => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => updateStatus(lead.id, s)}
                            className="text-white/70 hover:text-white cursor-pointer"
                          >
                            Mark as {STATUS_META[s].label}
                          </DropdownMenuItem>
                        ))}
                        {lead.conversation_id && (
                          <DropdownMenuItem
                            onClick={() => window.location.href = `/inbox?conversation=${lead.conversation_id}`}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-white/10 px-6 py-3 flex items-center justify-between">
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
