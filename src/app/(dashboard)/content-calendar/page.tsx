'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, Loader2, CalendarClock } from 'lucide-react';

interface PostRow {
  id: string;
  title: string;
  platform: string;
  caption: string | null;
  status: 'draft' | 'scheduled' | 'posted' | 'cancelled';
  scheduled_for: string | null;
  posted_at: string | null;
  created_at: string;
}

const STATUSES = ['draft', 'scheduled', 'posted', 'cancelled'] as const;
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', posted: 'Posted', cancelled: 'Cancelled' };
const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  scheduled: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  posted: 'bg-green-500/15 text-green-600 border-green-500/30',
  cancelled: 'bg-red-500/15 text-red-600 border-red-500/30',
};
const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', facebook: 'Facebook', other: 'Other',
};
const PAGE_SIZE = 25;

export default function ContentCalendarPage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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
        .from('content_posts')
        .select('id, title, platform, caption, status, scheduled_for, posted_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (debouncedSearch.trim()) {
        query = query.ilike('title', `%${debouncedSearch.trim().replace(/[%_]/g, '\\$&')}%`);
      }

      const { data, count, error } = await query;
      if (error) toast.error(error.message);
      else { setPosts((data as PostRow[]) ?? []); setTotal(count ?? 0); }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    const supabase = createClient();
    const { error } = await supabase
      .from('content_posts')
      .update({ status, updated_at: new Date().toISOString(), posted_at: status === 'posted' ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) toast.error('Update failed');
    else {
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: status as PostRow['status'] } : p)));
      toast.success(`Marked ${STATUS_LABEL[status]}`);
    }
    setUpdating(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Content Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total} posts tracked · planning only, nothing here is posted to any platform automatically
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground w-64"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
          {(['all', ...STATUSES] as string[]).map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(0); }}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filterStatus === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-float overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading posts...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <CalendarClock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No content planned yet</p>
            <p className="text-xs text-muted-foreground">Ask the Content Manager AI Employee to help plan a post</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Title</TableHead>
                <TableHead className="text-muted-foreground">Platform</TableHead>
                <TableHead className="text-muted-foreground">Scheduled For</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id} className="border-border">
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">{p.title}</div>
                    {p.caption && <div className="text-xs text-muted-foreground truncate max-w-md">{p.caption}</div>}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {PLATFORM_LABEL[p.platform] ?? p.platform}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.scheduled_for
                      ? new Date(p.scheduled_for).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
                      : p.posted_at
                        ? `Posted ${new Date(p.posted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                        : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_CLASS[p.status] ?? ''}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.status === 'draft' && (
                      <Button size="sm" variant="outline" disabled={updating === p.id} onClick={() => updateStatus(p.id, 'scheduled')}>
                        {updating === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Schedule'}
                      </Button>
                    )}
                    {p.status === 'scheduled' && (
                      <Button size="sm" variant="outline" disabled={updating === p.id} onClick={() => updateStatus(p.id, 'posted')}>
                        {updating === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark Posted'}
                      </Button>
                    )}
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
