import JSZip from "jszip";
import {
  emitReadyDownload,
  type ExportProgressHandler,
  fileNameFor,
  prepareReadyDownload,
  renderTicketCanvas,
  ticketCanvasToPdf,
  ticketToPngBlob,
} from "./ticketRenderer";
import type { Ticket } from "./types";

const PNG_ZIP_CHUNK_SIZE = 50;
const PDF_ZIP_CHUNK_SIZE = 100;

function uniqueName(base: string, ext: string, used: Set<string>): string {
  let candidate = `${base}.${ext}`;
  let n = 1;
  while (used.has(candidate)) candidate = `${base}_${n++}.${ext}`;
  used.add(candidate);
  return candidate;
}

async function downloadZip(
  zip: JSZip,
  fileName: string,
  onProgress?: ExportProgressHandler,
  done = 0,
  total = 0,
  part = 1,
  parts = 1,
  chunkStart = 0,
  chunkTotal = total,
) {
  onProgress?.({
    phase: "compress",
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    part,
    parts,
  });
  const content = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
    streamFiles: true,
  }, (metadata) => {
    const percent = total
      ? ((chunkStart + chunkTotal * (metadata.percent / 100)) / total) * 100
      : metadata.percent;
    onProgress?.({
      phase: "compress",
      done,
      total,
      percent,
      part,
      parts,
    });
  });
  onProgress?.({
    phase: "download",
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 100,
    part,
    parts,
  });
  const file = prepareReadyDownload(content, fileName, part, parts);
  emitReadyDownload(file, done, total, onProgress);
}

function safeFileBase(name: string) {
  return name.replace(/[^\w-]+/g, "_") || "billets";
}

function zipFileName(name: string, suffix: string, part: number, parts: number) {
  const base = safeFileBase(name);
  if (parts <= 1) return `${base}_${suffix}.zip`;
  const current = String(part).padStart(String(parts).length, "0");
  return `${base}_${suffix}_${current}-sur-${parts}.zip`;
}

function waitForBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
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
  const total = tickets.length;
  const parts = Math.ceil(total / PNG_ZIP_CHUNK_SIZE);
  const used = new Set<string>();
  let done = 0;

  for (let partIndex = 0; partIndex < parts; partIndex++) {
    const start = partIndex * PNG_ZIP_CHUNK_SIZE;
    const slice = tickets.slice(start, start + PNG_ZIP_CHUNK_SIZE);
    const zip = new JSZip();

    for (let i = 0; i < slice.length; i++) {
      const blob = await ticketToPngBlob(slice[i]);
      zip.file(uniqueName(fileNameFor(slice[i]), "png", used), blob);
      done += 1;
      onProgress?.({
        phase: "render",
        done,
        total,
        percent: Math.round((done / total) * 100),
        part: partIndex + 1,
        parts,
      });
      if (done % 5 === 0) await waitForBrowser();
    }

    await downloadZip(
      zip,
      zipFileName(name, "png", partIndex + 1, parts),
      onProgress,
      done,
      total,
      partIndex + 1,
      parts,
      start,
      slice.length,
    );
    await waitForBrowser();
  }
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
  const total = tickets.length;
  const parts = Math.ceil(total / PDF_ZIP_CHUNK_SIZE);
  const used = new Set<string>();
  let done = 0;

  for (let partIndex = 0; partIndex < parts; partIndex++) {
    const start = partIndex * PDF_ZIP_CHUNK_SIZE;
    const slice = tickets.slice(start, start + PDF_ZIP_CHUNK_SIZE);
    const zip = new JSZip();

    for (let i = 0; i < slice.length; i++) {
      const canvas = await renderTicketCanvas(slice[i]);
      const pdf = ticketCanvasToPdf([canvas]);
      const blob = pdf.output("blob");
      canvas.width = 0;
      canvas.height = 0;
      zip.file(uniqueName(fileNameFor(slice[i]), "pdf", used), blob);
      done += 1;
      onProgress?.({
        phase: "render",
        done,
        total,
        percent: Math.round((done / total) * 100),
        part: partIndex + 1,
        parts,
      });
      if (done % 5 === 0) await waitForBrowser();
    }

    await downloadZip(
      zip,
      zipFileName(name, "pdf", partIndex + 1, parts),
      onProgress,
      done,
      total,
      partIndex + 1,
      parts,
      start,
      slice.length,
    );
    await waitForBrowser();
  }
}
