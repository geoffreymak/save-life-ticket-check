import { supabase } from './supabase'
import { randomSecret } from './crypto'
import type { Batch, CategoryId, Ticket } from './types'

export interface NewTicketInput {
  holderName: string
  category: CategoryId
  email?: string
  phone?: string
  reference?: string
  seat?: string
}

export const TICKET_PREVIEW_LIMIT = 120

const SUPABASE_INSERT_LIMIT = 500
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface BulkWriteProgress {
  phase: 'preparing' | 'writing'
  done: number
  total: number
  batchesDone?: number
  batchesTotal?: number
}

type DbTicket = {
  id: string
  secret: string
  holder_name: string
  category: CategoryId
  email: string | null
  phone: string | null
  reference: string | null
  reference_key: string | null
  seat: string | null
  batch_id: string | null
  status: 'valid' | 'used'
  created_at: string
  created_by: string
  scan_count: number
  first_scan_at?: string | null
  first_scan_by?: string | null
  first_scan_by_email?: string | null
}

type DbBatch = {
  id: string
  name: string
  created_at: string
  created_by: string
  created_by_email: string
  count: number
}

function makeId() {
  return crypto.randomUUID()
}

function toTicket(row: DbTicket): Ticket {
  return {
    id: row.id,
    secret: row.secret,
    holderName: row.holder_name,
    category: row.category,
    email: row.email || '',
    phone: row.phone || '',
    reference: row.reference || '',
    referenceKey: row.reference_key || '',
    seat: row.seat || '',
    batchId: row.batch_id,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
    scanCount: row.scan_count || 0,
    firstScanAt: row.first_scan_at || undefined,
    firstScanBy: row.first_scan_by || undefined,
    firstScanByEmail: row.first_scan_by_email || undefined,
  }
}

function toBatch(row: DbBatch): Batch {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByEmail: row.created_by_email,
    count: row.count || 0,
  }
}

function ticketColumns() {
  return [
    'id',
    'secret',
    'holder_name',
    'category',
    'email',
    'phone',
    'reference',
    'reference_key',
    'seat',
    'batch_id',
    'status',
    'created_at',
    'created_by',
    'scan_count',
    'first_scan_at',
    'first_scan_by',
    'first_scan_by_email',
  ].join(',')
}

export async function createBatchWithTickets(
  batchName: string,
  rows: NewTicketInput[],
  user: { uid: string; email: string },
  onProgress?: (progress: BulkWriteProgress) => void,
): Promise<{ batchId: string; tickets: Ticket[] }> {
  const batchId = makeId()
  const createdAt = new Date().toISOString()

  const prepared = rows.map((r, i) => {
    const reference = r.reference?.trim() || `SL-${String(i + 1).padStart(4, '0')}`
    const ticket: Ticket = {
      id: makeId(),
      secret: randomSecret(),
      holderName: r.holderName,
      category: r.category,
      email: r.email || '',
      phone: r.phone || '',
      reference,
      referenceKey: reference.toLowerCase(),
      seat: r.seat || '',
      batchId,
      status: 'valid',
      createdAt,
      createdBy: user.uid,
      scanCount: 0,
    }
    return ticket
  })

  onProgress?.({ phase: 'preparing', done: 0, total: prepared.length })

  const batchRow = {
    id: batchId,
    name: batchName,
    created_at: createdAt,
    created_by: user.uid,
    created_by_email: user.email,
    count: prepared.length,
  }
  const { error: batchError } = await supabase.from('batches').insert(batchRow)
  if (batchError) throw batchError

  let done = 0
  const batchesTotal = Math.ceil(prepared.length / SUPABASE_INSERT_LIMIT)

  for (let i = 0; i < prepared.length; i += SUPABASE_INSERT_LIMIT) {
    const slice = prepared.slice(i, i + SUPABASE_INSERT_LIMIT)
    const payload = slice.map((ticket) => ({
      id: ticket.id,
      secret: ticket.secret,
      holder_name: ticket.holderName,
      category: ticket.category,
      email: ticket.email || '',
      phone: ticket.phone || '',
      reference: ticket.reference || '',
      reference_key: ticket.referenceKey || '',
      seat: ticket.seat || '',
      batch_id: batchId,
      status: ticket.status,
      created_at: createdAt,
      created_by: user.uid,
      scan_count: 0,
    }))

    const { error } = await supabase.from('tickets').insert(payload)
    if (error) throw error

    done += slice.length
    onProgress?.({
      phase: 'writing',
      done,
      total: prepared.length,
      batchesDone: Math.ceil((i + slice.length) / SUPABASE_INSERT_LIMIT),
      batchesTotal,
    })
  }

  return { batchId, tickets: prepared }
}

export async function getTicketsByBatch(batchId: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select(ticketColumns())
    .eq('batch_id', batchId)
    .order('reference', { ascending: true })

  if (error) throw error
  return ((data || []) as unknown as DbTicket[]).map(toTicket)
}

export async function getTicketsByBatchPreview(
  batchId: string,
  count = TICKET_PREVIEW_LIMIT,
): Promise<Ticket[]> {
  return getTicketsByBatchPage(batchId, 0, count)
}

export async function getTicketsByBatchPage(
  batchId: string,
  offset = 0,
  count = TICKET_PREVIEW_LIMIT,
): Promise<Ticket[]> {
  const from = Math.max(0, offset)
  const to = from + Math.max(1, count) - 1
  const { data, error } = await supabase
    .from('tickets')
    .select(ticketColumns())
    .eq('batch_id', batchId)
    .order('reference', { ascending: true })
    .range(from, to)

  if (error) throw error
  return ((data || []) as unknown as DbTicket[]).map(toTicket)
}

export async function getTicketsByIds(ids: string[]): Promise<Ticket[]> {
  const unique = [...new Set(ids.filter((id) => UUID_RE.test(id)))]
  if (unique.length === 0) return []

  const result: Ticket[] = []
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { data, error } = await supabase
      .from('tickets')
      .select(ticketColumns())
      .in('id', chunk)
    if (error) throw error
    result.push(...((data || []) as unknown as DbTicket[]).map(toTicket))
  }
  return result
}

export async function findTicketByReferenceOrId(
  value: string,
): Promise<Ticket | null> {
  const raw = value.trim()
  if (!raw) return null

  if (UUID_RE.test(raw)) {
    const byId = await getTicket(raw)
    if (byId) return byId
  }

  const { data: byKey, error: keyError } = await supabase
    .from('tickets')
    .select(ticketColumns())
    .eq('reference_key', raw.toLowerCase())
    .limit(1)
    .maybeSingle()
  if (keyError) throw keyError
  if (byKey) return toTicket(byKey as unknown as DbTicket)

  const variants = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])]
  const { data, error } = await supabase
    .from('tickets')
    .select(ticketColumns())
    .in('reference', variants)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? toTicket(data as unknown as DbTicket) : null
}

export async function listBatches(): Promise<Batch[]> {
  const { data, error } = await supabase
    .from('batches')
    .select('id,name,created_at,created_by,created_by_email,count')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data || []).map((row) => toBatch(row as DbBatch))
}

export type ScanResultType = 'admitted' | 'already_used' | 'not_found' | 'invalid'

export interface ScanResult {
  result: ScanResultType
  ticket?: Ticket
  firstScanAt?: string
  firstScanByEmail?: string
  scanCount?: number
}

export async function scanTicket(
  id: string,
  secret: string,
  _user: { uid: string; email: string },
): Promise<ScanResult> {
  if (!UUID_RE.test(id)) return { result: 'invalid' }

  const { data, error } = await supabase.rpc('scan_ticket', {
    p_ticket_id: id,
    p_secret: secret,
  })
  if (error) throw error

  const raw = data as {
    result: ScanResultType
    ticket?: DbTicket
    firstScanAt?: string
    firstScanByEmail?: string
    scanCount?: number
  }

  return {
    result: raw.result,
    ticket: raw.ticket ? toTicket(raw.ticket) : undefined,
    firstScanAt: raw.firstScanAt,
    firstScanByEmail: raw.firstScanByEmail,
    scanCount: raw.scanCount,
  }
}

export async function getTicket(id: string): Promise<Ticket | null> {
  if (!UUID_RE.test(id)) return null
  const { data, error } = await supabase
    .from('tickets')
    .select(ticketColumns())
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? toTicket(data as unknown as DbTicket) : null
}

export async function getRecentScans(ticketId: string) {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data || []
}

export async function getDashboardStats(batchId?: string) {
  let query = supabase
    .from('tickets')
    .select('category,status', { count: 'exact' })

  if (batchId) query = query.eq('batch_id', batchId)

  const { data, error, count } = await query
  if (error) throw error

  let used = 0
  const byCategory: Record<string, { total: number; used: number }> = {}
  for (const row of data || []) {
    const c = (byCategory[row.category] ||= { total: 0, used: 0 })
    c.total++
    if (row.status === 'used') {
      c.used++
      used++
    }
  }
  return { total: count || 0, used, byCategory }
}

export async function createAddOn(
  input: NewTicketInput,
  user: { uid: string; email: string },
): Promise<Ticket> {
  const reference = input.reference?.trim() || ''
  const ticket: Ticket = {
    id: makeId(),
    secret: randomSecret(),
    holderName: input.holderName,
    category: input.category,
    email: input.email || '',
    phone: input.phone || '',
    reference,
    referenceKey: reference.toLowerCase(),
    seat: input.seat || '',
    batchId: null,
    status: 'valid',
    createdAt: new Date().toISOString(),
    createdBy: user.uid,
    scanCount: 0,
  }

  const { error } = await supabase.from('tickets').insert({
    id: ticket.id,
    secret: ticket.secret,
    holder_name: ticket.holderName,
    category: ticket.category,
    email: ticket.email || '',
    phone: ticket.phone || '',
    reference: ticket.reference || '',
    reference_key: ticket.referenceKey || '',
    seat: ticket.seat || '',
    batch_id: null,
    status: ticket.status,
    created_at: ticket.createdAt,
    created_by: user.uid,
    scan_count: 0,
  })
  if (error) throw error

  return ticket
}
