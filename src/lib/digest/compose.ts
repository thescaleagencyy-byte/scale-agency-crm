import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Daily digest — "every morning it says what you should do today."
// Deliberately narrower than the Copilot's full buildDataContext:
// this is action items only (overdue money, hot untouched leads,
// today's appointments, conversations waiting on a reply), not a
// full data dump. Shared by the manual "generate now" endpoint and
// the cron sweep so both produce identical output.
// ============================================================

export interface DigestStats {
  overdueInvoices: number
  overdueAmount: number
  hotLeads: number
  appointmentsToday: number
  openConversationsNoReplyToday: number
}

export interface DigestResult {
  content: string
  stats: DigestStats
}

export async function composeDigest(
  db: SupabaseClient,
  accountId: string,
  currency: string,
): Promise<DigestResult> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()
  const todayDateStr = todayIso.slice(0, 10)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const [invoicesRes, leadsRes, apptsRes, convsRes] = await Promise.all([
    db
      .from('client_invoices')
      .select('title, amount, due_date, contact:contacts(name, phone)')
      .eq('account_id', accountId)
      .in('status', ['unpaid', 'overdue'])
      .lt('due_date', todayDateStr),
    db
      .from('leads')
      .select('customer_name, company, score, created_at')
      .eq('account_id', accountId)
      .eq('status', 'new')
      .gte('score', 60)
      .limit(20),
    db
      .from('appointments')
      .select('status, slot:booking_slots(start_at), contact:contacts(name, phone)')
      .eq('account_id', accountId)
      .eq('status', 'confirmed'),
    db
      .from('conversations')
      .select('id, contact:contacts(name, phone)')
      .eq('account_id', accountId)
      .eq('status', 'open')
      .lt('last_message_at', todayIso),
  ])

  type ContactRef = { name: string | null; phone: string } | { name: string | null; phone: string }[] | null
  const oneContact = (c: ContactRef) => (Array.isArray(c) ? c[0] ?? null : c)

  const overdueInvoices = (invoicesRes.data ?? []) as { title: string; amount: number; due_date: string; contact: ContactRef }[]
  const hotLeads = (leadsRes.data ?? []) as { customer_name: string | null; company: string | null; score: number; created_at: string }[]
  const appts = (apptsRes.data ?? []) as unknown as { status: string; slot: { start_at: string }[] | { start_at: string } | null; contact: ContactRef }[]
  const staleConvs = (convsRes.data ?? []) as { id: string; contact: ContactRef }[]

  const appointmentsToday = appts.filter((a) => {
    const slot = Array.isArray(a.slot) ? a.slot[0] : a.slot
    if (!slot?.start_at) return false
    return slot.start_at >= todayIso && slot.start_at < tomorrowStart.toISOString()
  })

  const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.amount ?? 0), 0)

  const stats: DigestStats = {
    overdueInvoices: overdueInvoices.length,
    overdueAmount,
    hotLeads: hotLeads.length,
    appointmentsToday: appointmentsToday.length,
    openConversationsNoReplyToday: staleConvs.length,
  }

  const lines: string[] = []
  lines.push(`Good morning — here's what needs your attention today:`)
  lines.push('')

  if (overdueInvoices.length > 0) {
    lines.push(`💰 ${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'} worth ${currency} ${overdueAmount.toLocaleString()}`)
    for (const inv of overdueInvoices.slice(0, 5)) {
      const c = oneContact(inv.contact)
      lines.push(`   • ${c?.name ?? c?.phone ?? 'Unknown'} — ${currency} ${inv.amount.toLocaleString()} (was due ${inv.due_date})`)
    }
  }

  if (hotLeads.length > 0) {
    lines.push(`🔥 ${hotLeads.length} hot lead${hotLeads.length === 1 ? '' : 's'} (score ≥60) still untouched`)
    for (const l of hotLeads.slice(0, 5)) {
      lines.push(`   • ${l.customer_name ?? 'Unknown'}${l.company ? ` (${l.company})` : ''} — score ${l.score}`)
    }
  }

  if (appointmentsToday.length > 0) {
    lines.push(`📅 ${appointmentsToday.length} appointment${appointmentsToday.length === 1 ? '' : 's'} today`)
  }

  if (staleConvs.length > 0) {
    lines.push(`💬 ${staleConvs.length} conversation${staleConvs.length === 1 ? '' : 's'} waiting on a reply from you`)
  }

  if (overdueInvoices.length === 0 && hotLeads.length === 0 && appointmentsToday.length === 0 && staleConvs.length === 0) {
    lines.push(`✅ Nothing urgent — inbox clear, no overdue invoices, no untouched hot leads.`)
  }

  return { content: lines.join('\n'), stats }
}
