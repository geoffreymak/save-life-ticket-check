import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "generator" | "verifier" | "pending";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt?: Timestamp;
}

/** Identifiants de catégorie correspondant aux trois modèles de billet. */
export type CategoryId = "VVIP" | "VIP" | "STANDARD";

export type TicketStatus = "valid" | "used";

export interface ScanEvent {
  at: Timestamp;
  by: string; // uid
  byEmail: string;
  result: "admitted" | "already_used";
}

export interface Ticket {
  id: string;
  /** Jeton aléatoire (anti-falsification) encodé dans le QR avec l'id. */
  secret: string;
  holderName: string;
  category: CategoryId;
  email?: string;
  phone?: string;
  reference?: string; // numéro de billet lisible (ex: SL-0001)
  seat?: string;
  batchId: string;
  status: TicketStatus;
  createdAt: Timestamp;
  createdBy: string;
  scanCount: number;
  firstScanAt?: Timestamp;
  firstScanBy?: string;
  firstScanByEmail?: string;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: Timestamp;
  createdBy: string;
  createdByEmail: string;
  count: number;
}
