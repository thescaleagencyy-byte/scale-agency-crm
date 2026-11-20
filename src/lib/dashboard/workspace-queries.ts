import type { SupabaseClient } from '@supabase/supabase-js'

type DB = SupabaseClient

export interface ScheduleItem {
  id: string
  startAt: string
  endAt: string
  service: string | null
  people: { name: string | null; phone: string | null }[]
}

export interface WorkspaceLead {
  id: string
  name: string | null
  phone: string
  service: string | null
  summary: string | null
  source: string | null
  status: string
  score: number
  quality: 'hot' | 'warm' | 'cold' | null
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

/** Booked slots that start today, with the people booked into each. */
export async function loadTodaySchedule(db: DB): Promise<ScheduleItem[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data, error } = await db
    .from('booking_slots')
    .select('id, start_at, end_at, service:booking_services(name), appointments(status, contact:contacts(name, phone))')
    .gte('start_at', start.toISOString())
    .lt('start_at', end.toISOString())
    .gt('booked_count', 0)
    .order('start_at')
    .limit(12)
  if (error) throw error

  type Row = {
    id: string
    start_at: string
    end_at: string
    service: { name: string | null } | { name: string | null }[] | null
    appointments: { status: string; contact: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null }[] | null
  }
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  return ((data ?? []) as Row[])
    .map((r) => ({
      id: r.id,
      startAt: r.start_at,
      endAt: r.end_at,
      service: one(r.service)?.name ?? null,
      people: (r.appointments ?? [])
        .filter((a) => a.status !== 'cancelled')
        .map((a) => one(a.contact) ?? { name: null, phone: null }),
    }))
    .filter((s) => s.people.length > 0)
}

const LEAD_COLUMNS =
  'id, customer_name, customer_phone, service_type, ai_summary, source, status, score, ai_quality, conversation_id, created_at, updated_at'

type LeadRow = {
  id: string
  customer_name: string | null
  customer_phone: string
  service_type: string | null
  ai_summary: string | null
  source: string | null
  status: string
  score: number | null
  ai_quality: 'hot' | 'warm' | 'cold' | null
  conversation_id: string | null
  created_at: string
  updated_at: string
}

function toLead(r: LeadRow): WorkspaceLead {
  return {
    id: r.id,
    name: r.customer_name?.trim() || null,
    phone: r.customer_phone,
    service: r.service_type?.trim() || null,
    summary: r.ai_summary?.trim() || null,
    source: r.source,
    status: r.status,
    score: r.score ?? 0,
    quality: r.ai_quality,
    conversationId: r.conversation_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Newest leads first, plus the total count for the section header. */
export async function loadNewLeads(db: DB, limit = 24): Promise<{ leads: WorkspaceLead[]; total: number }> {
  const { data, error, count } = await db
    .from('leads')
    .select(LEAD_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return { leads: ((data ?? []) as LeadRow[]).map(toLead), total: count ?? 0 }
}

/** Leads still marked "new" with nothing done for 3+ days — the follow-up list. */
export async function loadFollowUps(db: DB, limit = 12): Promise<{ leads: WorkspaceLead[]; total: number }> {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error, count } = await db
    .from('leads')
    .select(LEAD_COLUMNS, { count: 'exact' })
    .eq('status', 'new')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return { leads: ((data ?? []) as LeadRow[]).map(toLead), total: count ?? 0 }
}
