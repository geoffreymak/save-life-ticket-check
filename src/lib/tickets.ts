import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
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

const FIRESTORE_BATCH_LIMIT = 450
export const TICKET_PREVIEW_LIMIT = 120

export interface BulkWriteProgress {
  phase: 'preparing' | 'writing'
  done: number
  total: number
  batchesDone?: number
  batchesTotal?: number
}

/** Crée un lot + tous ses billets de façon atomique (par tranches). */
export async function createBatchWithTickets(
  batchName: string,
  rows: NewTicketInput[],
  user: { uid: string; email: string },
  onProgress?: (progress: BulkWriteProgress) => void,
): Promise<{ batchId: string; tickets: Ticket[] }> {
  const batchRef = doc(collection(db, 'batches'))
  const batchId = batchRef.id
  const createdAt = Timestamp.now()

  const prepared = rows.map((r, i) => {
    const ref = doc(collection(db, 'tickets'))
    const reference = r.reference?.trim() || `SL-${String(i + 1).padStart(4, '0')}`
    return { ref, reference, secret: randomSecret(), input: r }
  })
  onProgress?.({ phase: 'preparing', done: 0, total: prepared.length })

  // Écriture du lot d'abord.
  await setDoc(batchRef, {
    name: batchName,
    createdAt,
    createdBy: user.uid,
    createdByEmail: user.email,
    count: prepared.length,
  })

  // Tickets par tranches (limite Firestore 500 ops/batch).
  let done = 0
  const batchesTotal = Math.ceil(prepared.length / FIRESTORE_BATCH_LIMIT)
  for (let i = 0; i < prepared.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = prepared.slice(i, i + FIRESTORE_BATCH_LIMIT)
    const wb = writeBatch(db)
    for (const p of slice) {
      wb.set(p.ref, {
        secret: p.secret,
        holderName: p.input.holderName,
        category: p.input.category,
        email: p.input.email || '',
        phone: p.input.phone || '',
        reference: p.reference,
        referenceKey: p.reference.toLowerCase(),
        seat: p.input.seat || '',
        batchId,
        status: 'valid',
        createdAt,
        createdBy: user.uid,
        scanCount: 0,
      })
    }
    await wb.commit()
    done += slice.length
    onProgress?.({
      phase: 'writing',
      done,
      total: prepared.length,
      batchesDone: Math.ceil((i + slice.length) / FIRESTORE_BATCH_LIMIT),
      batchesTotal,
    })
  }

  // Retour local : evite une relecture couteuse de tout le lot apres ecriture.
  const tickets: Ticket[] = prepared.map((p) => ({
    id: p.ref.id,
    secret: p.secret,
    holderName: p.input.holderName,
    category: p.input.category,
    email: p.input.email || '',
    phone: p.input.phone || '',
    reference: p.reference,
    referenceKey: p.reference.toLowerCase(),
    seat: p.input.seat || '',
    batchId,
    status: 'valid',
    createdAt,
    createdBy: user.uid,
    scanCount: 0,
  }))
  return { batchId, tickets }
}

export async function getTicketsByBatch(batchId: string): Promise<Ticket[]> {
  const q = query(collection(db, 'tickets'), where('batchId', '==', batchId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ticket, 'id'>) }))
}

export async function getTicketsByBatchPreview(
  batchId: string,
  count = TICKET_PREVIEW_LIMIT,
): Promise<Ticket[]> {
  const q = query(
    collection(db, 'tickets'),
    where('batchId', '==', batchId),
    limit(count),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ticket, 'id'>) }))
}

export async function getTicketsByIds(ids: string[]): Promise<Ticket[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []

  const result: Ticket[] = []
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30)
    const q = query(collection(db, 'tickets'), where(documentId(), 'in', chunk))
    const snap = await getDocs(q)
    result.push(
      ...snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Ticket, 'id'>),
      })),
    )
  }
  return result
}

export async function findTicketByReferenceOrId(
  value: string,
): Promise<Ticket | null> {
  const raw = value.trim()
  if (!raw) return null

  const byId = await getTicket(raw)
  if (byId) return byId

  const byKey = await getDocs(
    query(
      collection(db, 'tickets'),
      where('referenceKey', '==', raw.toLowerCase()),
      limit(1),
    ),
  )
  if (!byKey.empty) {
    const d = byKey.docs[0]
    return { id: d.id, ...(d.data() as Omit<Ticket, 'id'>) }
  }

  const variants = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])]
  const byReference = await getDocs(
    query(
      collection(db, 'tickets'),
      where('reference', 'in', variants),
      limit(1),
    ),
  )
  if (byReference.empty) return null
  const d = byReference.docs[0]
  return { id: d.id, ...(d.data() as Omit<Ticket, 'id'>) }
}

export async function listBatches(): Promise<Batch[]> {
  const q = query(collection(db, 'batches'), orderBy('createdAt', 'desc'), limit(100))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }))
}

export type ScanResultType = 'admitted' | 'already_used' | 'not_found' | 'invalid'

export interface ScanResult {
  result: ScanResultType
  ticket?: Ticket
  firstScanAt?: Timestamp
  firstScanByEmail?: string
  scanCount?: number
}

/**
 * Vérifie et "consomme" un billet de manière atomique.
 * - 1er scan d'un billet valide => admitted (statut => used).
 * - scans suivants => already_used + détails du 1er passage.
 * - jeton invalide ou billet inexistant => refusé.
 */
export async function scanTicket(
  id: string,
  secret: string,
  user: { uid: string; email: string },
): Promise<ScanResult> {
  const ticketRef = doc(db, 'tickets', id)
  const scanLogRef = doc(collection(db, 'tickets', id, 'scans'))

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ticketRef)
    if (!snap.exists()) return { result: 'not_found' as const }

    const data = snap.data() as Omit<Ticket, 'id'>
    if (data.secret !== secret) return { result: 'invalid' as const }

    const ticket: Ticket = { id, ...data }
    const now = Timestamp.now()

    if (data.status === 'valid') {
      tx.update(ticketRef, {
        status: 'used',
        scanCount: (data.scanCount || 0) + 1,
        firstScanAt: now,
        firstScanBy: user.uid,
        firstScanByEmail: user.email,
      })
      tx.set(scanLogRef, {
        at: now,
        by: user.uid,
        byEmail: user.email,
        result: 'admitted',
      })
      return {
        result: 'admitted' as const,
        ticket: { ...ticket, status: 'used', scanCount: (data.scanCount || 0) + 1 },
        scanCount: (data.scanCount || 0) + 1,
      }
    }

    // Déjà utilisé : on incrémente le compteur + log, sans réadmettre.
    tx.update(ticketRef, { scanCount: (data.scanCount || 0) + 1 })
    tx.set(scanLogRef, {
      at: now,
      by: user.uid,
      byEmail: user.email,
      result: 'already_used',
    })
    return {
      result: 'already_used' as const,
      ticket,
      firstScanAt: data.firstScanAt,
      firstScanByEmail: data.firstScanByEmail,
      scanCount: (data.scanCount || 0) + 1,
    }
  })
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const snap = await getDoc(doc(db, 'tickets', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Ticket, 'id'>) }
}

export async function getRecentScans(ticketId: string) {
  const q = query(
    collection(db, 'tickets', ticketId, 'scans'),
    orderBy('at', 'desc'),
    limit(20),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data())
}

/** Journal global des derniers scans (pour le tableau de bord vérificateur). */
export async function getDashboardStats(batchId?: string) {
  const base = collection(db, 'tickets')
  const q = batchId ? query(base, where('batchId', '==', batchId)) : query(base, limit(1000))
  const snap = await getDocs(q)
  let total = 0
  let used = 0
  const byCategory: Record<string, { total: number; used: number }> = {}
  snap.forEach((d) => {
    const t = d.data() as Ticket
    total++
    if (t.status === 'used') used++
    const c = (byCategory[t.category] ||= { total: 0, used: 0 })
    c.total++
    if (t.status === 'used') c.used++
  })
  return { total, used, byCategory }
}

export async function createAddOn(
  input: NewTicketInput,
  user: { uid: string; email: string },
): Promise<Ticket> {
  const res = await addDoc(collection(db, 'tickets'), {
    secret: randomSecret(),
    holderName: input.holderName,
    category: input.category,
    email: input.email || '',
    phone: input.phone || '',
    reference: input.reference || '',
    referenceKey: (input.reference || '').toLowerCase(),
    seat: input.seat || '',
    batchId: 'manuel',
    status: 'valid',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    scanCount: 0,
  })
  const created = await getTicket(res.id)
  return created!
}
