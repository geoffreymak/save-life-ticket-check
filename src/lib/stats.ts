import { supabase } from './supabase'
import { CATEGORY_LIST } from './categories'
import { getTicketsByIds } from './tickets'
import type { CategoryId, Ticket } from './types'

export interface LiveScan {
  id: string
  ticketId: string
  at: string
  by: string
  byEmail: string
  result: 'admitted' | 'already_used'
}

export interface CategoryStat {
  id: CategoryId
  total: number
  used: number
  remaining: number
}

export interface ComputedStats {
  total: number
  used: number
  remaining: number
  byCategory: Record<CategoryId, CategoryStat>
  scansTotal: number
  admittedScans: number
  refusedScans: number
}

type DbScan = {
  id: string
  ticket_id: string
  at: string
  by: string
  by_email: string
  result: 'admitted' | 'already_used'
}

function toLiveScan(row: DbScan): LiveScan {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    at: row.at,
    by: row.by,
    byEmail: row.by_email,
    result: row.result,
  }
}

function emptyCat(id: CategoryId): CategoryStat {
  return { id, total: 0, used: 0, remaining: 0 }
}

export function emptyStats(): ComputedStats {
  const byCategory = CATEGORY_LIST.reduce(
    (acc, cat) => {
      acc[cat.id] = emptyCat(cat.id)
      return acc
    },
    {} as Record<CategoryId, CategoryStat>,
  )

  return {
    total: 0,
    used: 0,
    remaining: 0,
    byCategory,
    scansTotal: 0,
    admittedScans: 0,
    refusedScans: 0,
  }
}

export async function getEventStats(): Promise<ComputedStats> {
  const { data, error } = await supabase.rpc('event_stats')
  if (error) throw error

  const raw = data as Partial<ComputedStats> | null
  const stats = emptyStats()
  if (!raw) return stats

  stats.total = Number(raw.total || 0)
  stats.used = Number(raw.used || 0)
  stats.remaining = Number(raw.remaining ?? stats.total - stats.used)
  stats.scansTotal = Number(raw.scansTotal || 0)
  stats.admittedScans = Number(raw.admittedScans || 0)
  stats.refusedScans = Number(raw.refusedScans || 0)

  const rawByCategory =
    (raw.byCategory || {}) as Record<CategoryId, Partial<CategoryStat>>
  for (const cat of CATEGORY_LIST) {
    const current = rawByCategory[cat.id]
    stats.byCategory[cat.id] = {
      id: cat.id,
      total: Number(current?.total || 0),
      used: Number(current?.used || 0),
      remaining: Number(current?.remaining || 0),
    }
  }

  return stats
}

export async function fetchRecentScans(n = 60): Promise<LiveScan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('id,ticket_id,at,by,by_email,result')
    .order('at', { ascending: false })
    .limit(n)

  if (error) throw error
  return (data || []).map((row) => toLiveScan(row as DbScan))
}

export function subscribeRecentScans(
  cb: (scans: LiveScan[]) => void,
  n = 60,
  onError?: (e: Error) => void,
) {
  let active = true

  const refresh = async () => {
    try {
      const scans = await fetchRecentScans(n)
      if (active) cb(scans)
    } catch (e) {
      if (active) onError?.(e as Error)
    }
  }

  refresh()
  const channel = supabase
    .channel('recent-scans')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'scans' },
      () => {
        refresh()
      },
    )
    .subscribe()

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

export function subscribeTickets(
  cb: (tickets: Ticket[]) => void,
  onError?: (e: Error) => void,
) {
  let active = true

  const refresh = async () => {
    try {
      const { data, error } = await supabase.from('tickets').select('id')
      if (error) throw error
      const ids = (data || []).map((row) => row.id)
      const tickets = await getTicketsByIds(ids)
      if (active) cb(tickets)
    } catch (e) {
      if (active) onError?.(e as Error)
    }
  }

  refresh()
  const channel = supabase
    .channel('tickets-all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets' },
      () => {
        refresh()
      },
    )
    .subscribe()

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

export function computeStats(
  tickets: Ticket[],
  scans: LiveScan[],
): ComputedStats {
  const byCategory = CATEGORY_LIST.reduce(
    (acc, cat) => {
      acc[cat.id] = emptyCat(cat.id)
      return acc
    },
    {} as Record<CategoryId, CategoryStat>,
  )
  let used = 0
  let refusedScans = 0
  for (const t of tickets) {
    const c = byCategory[t.category]
    if (!c) continue
    c.total++
    if (t.status === 'used') {
      c.used++
      used++
    }
    if ((t.scanCount || 0) > 1) refusedScans += t.scanCount - 1
  }
  for (const c of Object.values(byCategory)) c.remaining = c.total - c.used

  void scans

  return {
    total: tickets.length,
    used,
    remaining: tickets.length - used,
    byCategory,
    scansTotal: used + refusedScans,
    admittedScans: used,
    refusedScans,
  }
}
