import JSZip from "jszip";
import {
  type ExportProgressHandler,
  fileNameFor,
  renderTicketCanvas,
  ticketCanvasToPdf,
  ticketToPngBlob,
} from "./ticketRenderer";
import type { Ticket } from "./types";

function uniqueName(base: string, ext: string, used: Set<string>): string {
  let candidate = `${base}.${ext}`;
  let n = 1;
  while (used.has(candidate)) candidate = `${base}_${n++}.${ext}`;
  used.add(candidate);
  return candidate;
}

async function downloadZip(
  zip: JSZip,
  name: string,
  suffix: string,
  onProgress?: ExportProgressHandler,
  total = 0,
) {
  onProgress?.({ phase: "compress", done: 0, total: 100, percent: 0 });
  const content = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
    streamFiles: true,
  }, (metadata) => {
    onProgress?.({
      phase: "compress",
      done: Math.round(metadata.percent),
      total: 100,
      percent: metadata.percent,
    });
  });
  onProgress?.({ phase: "download", done: total, total });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "_")}_${suffix}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Génère tous les billets en PNG, les compresse dans un ZIP et déclenche le
 * téléchargement. `onProgress` permet d'afficher l'avancement.
 */
export async function downloadBatchZipPng(
  tickets: Ticket[],
  name: string,
  onProgress?: ExportProgressHandler,
): Promise<void> {
  const zip = new JSZip();
  const total = tickets.length;
  const used = new Set<string>();

  for (let i = 0; i < tickets.length; i++) {
    const blob = await ticketToPngBlob(tickets[i]);
    zip.file(uniqueName(fileNameFor(tickets[i]), "png", used), blob);
    onProgress?.({ phase: "render", done: i + 1, total });
    if (i % 5 === 4) await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  await downloadZip(zip, name, "png", onProgress, total);
}

/**
 * Génère un PDF individuel par billet (1 page = 1 billet) et les regroupe dans
 * un ZIP. Pratique pour distribuer chaque billet séparément.
 */
export async function downloadBatchZipPdf(
  tickets: Ticket[],
  name: string,
  onProgress?: ExportProgressHandler,
): Promise<void> {
  const zip = new JSZip();
  const total = tickets.length;
  const used = new Set<string>();

  for (let i = 0; i < tickets.length; i++) {
    const canvas = await renderTicketCanvas(tickets[i]);
    const pdf = ticketCanvasToPdf([canvas]);
    const blob = pdf.output("blob");
    canvas.width = 0;
    canvas.height = 0;
    zip.file(uniqueName(fileNameFor(tickets[i]), "pdf", used), blob);
    onProgress?.({ phase: "render", done: i + 1, total });
    if (i % 5 === 4) await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  await downloadZip(zip, name, "pdf", onProgress, total);
}
