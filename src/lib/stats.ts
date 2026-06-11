import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { CATEGORY_LIST } from "./categories";
import { db } from "./firebase";
import type { CategoryId, Ticket } from "./types";

/** Abonnement temps réel à TOUS les billets. Retourne la fonction de désinscription. */
export function subscribeTickets(
  cb: (tickets: Ticket[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(collection(db, "tickets"));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Ticket, "id">),
        })),
      ),
    (err) => onError?.(err),
  );
}

export interface LiveScan {
  id: string;
  ticketId: string;
  at: Timestamp;
  by: string;
  byEmail: string;
  result: "admitted" | "already_used";
}

/** Abonnement temps réel aux derniers scans (toutes catégories confondues). */
export function subscribeRecentScans(
  cb: (scans: LiveScan[]) => void,
  n = 60,
  onError?: (e: Error) => void,
) {
  const q = query(
    collectionGroup(db, "scans"),
    orderBy("at", "desc"),
    limit(n),
  );
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map((d) => ({
          id: d.id,
          ticketId: d.ref.parent.parent?.id || "",
          ...(d.data() as Omit<LiveScan, "id" | "ticketId">),
        })),
      ),
    (err) => onError?.(err),
  );
}

export interface CategoryStat {
  id: CategoryId;
  total: number;
  used: number;
  remaining: number;
}

export interface ComputedStats {
  total: number;
  used: number;
  remaining: number;
  byCategory: Record<CategoryId, CategoryStat>;
  scansTotal: number;
  admittedScans: number;
  refusedScans: number;
}

const EMPTY_CAT = (id: CategoryId): CategoryStat => ({
  id,
  total: 0,
  used: 0,
  remaining: 0,
});

export function computeStats(
  tickets: Ticket[],
  scans: LiveScan[],
): ComputedStats {
  const byCategory = CATEGORY_LIST.reduce(
    (acc, cat) => {
      acc[cat.id] = EMPTY_CAT(cat.id);
      return acc;
    },
    {} as Record<CategoryId, CategoryStat>,
  );
  let used = 0;
  let refusedScans = 0;
  for (const t of tickets) {
    const c = byCategory[t.category];
    if (!c) continue;
    c.total++;
    if (t.status === "used") {
      c.used++;
      used++;
    }
    // Au-delà du 1er scan (admission), chaque scan supplémentaire est un refus (doublon).
    if ((t.scanCount || 0) > 1) refusedScans += t.scanCount - 1;
  }
  for (const c of Object.values(byCategory)) c.remaining = c.total - c.used;

  // Le flux temps réel `scans` sert au feed d'activité ; il n'est pas utilisé ici.
  void scans;

  return {
    total: tickets.length,
    used,
    remaining: tickets.length - used,
    byCategory,
    scansTotal: used + refusedScans,
    admittedScans: used,
    refusedScans,
  };
}
