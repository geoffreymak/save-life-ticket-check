import * as QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { CATEGORIES } from "./categories";
import { buildQrPayload } from "./crypto";
import type { Ticket } from "./types";

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const PDF_WIDTH_MM = 220;

export type ExportPhase = "render" | "compress" | "download";

export interface ExportProgress {
  phase: ExportPhase;
  done: number;
  total: number;
  percent?: number;
}

export type ExportProgressHandler = (progress: ExportProgress) => void;

function loadImage(src: string): Promise<HTMLImageElement> {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error(`Impossible de charger le modèle: ${src}`));
        img.src = src;
      }),
    );
  }
  return imageCache.get(src)!;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Compose le billet final : modèle PNG + QR code placé dans le cadre
 * "VERIFICATION ACCÈS". Retourne un canvas en pleine résolution (2480x877).
 */
export async function renderTicketCanvas(
  ticket: Ticket,
): Promise<HTMLCanvasElement> {
  const cfg = CATEGORIES[ticket.category];
  const template = await loadImage(cfg.template);

  const canvas = document.createElement("canvas");
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(template, 0, 0, cfg.width, cfg.height);

  // QR haute correction d'erreur (robuste à l'impression / dégradations).
  const payload = buildQrPayload(ticket.id, ticket.secret);
  const qrSize = cfg.qr.size;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, payload, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: qrSize,
    color: { dark: "#111111", light: "#ffffff" },
  });

  const pad = Math.round(qrSize * 0.12);
  const bgSize = qrSize + pad * 2;
  const bgX = cfg.qr.cx - bgSize / 2;
  const bgY = cfg.qr.cy - bgSize / 2;

  // Fond blanc arrondi (zone de silence pour garantir la lisibilité du QR).
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bgX, bgY, bgSize, bgSize, Math.round(bgSize * 0.1));
  ctx.fill();
  ctx.restore();

  ctx.drawImage(
    qrCanvas,
    cfg.qr.cx - qrSize / 2,
    cfg.qr.cy - qrSize / 2,
    qrSize,
    qrSize,
  );
  qrCanvas.width = 0;
  qrCanvas.height = 0;

  return canvas;
}

export function fileNameFor(ticket: Ticket): string {
  const safe = (ticket.reference || ticket.id).replace(/[^\w-]+/g, "_");
  const name = ticket.holderName.replace(/[^\w-]+/g, "_").slice(0, 40);
  return `billet_${safe}_${name}`;
}

export async function ticketToPngBlob(ticket: Ticket): Promise<Blob> {
  const canvas = await renderTicketCanvas(ticket);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob a échoué"))),
      "image/png",
    ),
  );
  releaseCanvas(canvas);
  return blob;
}

export async function downloadTicketPng(ticket: Ticket): Promise<void> {
  const blob = await ticketToPngBlob(ticket);
  triggerDownload(blob, `${fileNameFor(ticket)}.png`);
}

export async function downloadTicketPdf(ticket: Ticket): Promise<void> {
  const canvas = await renderTicketCanvas(ticket);
  const pdf = ticketCanvasToPdf([canvas]);
  releaseCanvas(canvas);
  pdf.save(`${fileNameFor(ticket)}.pdf`);
}

/** Construit un PDF multi-pages (1 billet / page) à partir de canvases. */
export function ticketCanvasToPdf(canvases: HTMLCanvasElement[]): jsPDF {
  const first = canvases[0];
  const ratio = first.height / first.width;
  // Largeur fixe en mm, hauteur proportionnelle.
  const wMm = PDF_WIDTH_MM;
  const hMm = wMm * ratio;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [wMm, hMm],
  });
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage([wMm, hMm], "landscape");
    const data = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(data, "JPEG", 0, 0, wMm, hMm);
  });
  return pdf;
}

function addCanvasPage(pdf: jsPDF, canvas: HTMLCanvasElement, isFirst: boolean) {
  const ratio = canvas.height / canvas.width;
  const wMm = PDF_WIDTH_MM;
  const hMm = wMm * ratio;
  if (!isFirst) pdf.addPage([wMm, hMm], "landscape");
  const data = canvas.toDataURL("image/jpeg", 0.9);
  pdf.addImage(data, "JPEG", 0, 0, wMm, hMm);
}

function makePdfForCanvas(canvas: HTMLCanvasElement) {
  const ratio = canvas.height / canvas.width;
  const wMm = PDF_WIDTH_MM;
  const hMm = wMm * ratio;
  return new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [wMm, hMm],
  });
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export async function downloadBatchPdf(
  tickets: Ticket[],
  name: string,
  onProgress?: ExportProgressHandler,
): Promise<void> {
  if (tickets.length === 0) return;

  let pdf: jsPDF | null = null;
  const total = tickets.length;

  for (let i = 0; i < total; i++) {
    const canvas = await renderTicketCanvas(tickets[i]);
    if (!pdf) pdf = makePdfForCanvas(canvas);
    addCanvasPage(pdf, canvas, i === 0);
    releaseCanvas(canvas);
    onProgress?.({ phase: "render", done: i + 1, total });
    if (i % 5 === 4) await yieldToBrowser();
  }

  onProgress?.({ phase: "download", done: total, total });
  pdf!.save(`${name}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
