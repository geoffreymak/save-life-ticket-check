export type Role = "admin" | "generator" | "verifier" | "pending";
export type AppTimestamp = string;

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt?: AppTimestamp;
}

/** Identifiants de catégorie correspondant aux trois modèles de billet. */
export type CategoryId = "VVIP" | "VIP" | "STANDARD";

export type TicketStatus = "valid" | "used";

export interface ScanEvent {
  at: AppTimestamp;
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
  referenceKey?: string;
  seat?: string;
  batchId: string | null;
  status: TicketStatus;
  createdAt: AppTimestamp;
  createdBy: string;
  scanCount: number;
  firstScanAt?: AppTimestamp;
  firstScanBy?: string;
  firstScanByEmail?: string;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: AppTimestamp;
  createdBy: string;
  createdByEmail: string;
  count: number;
}
