import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Upload,
} from "lucide-react";
import { parseCsv, downloadCsvTemplate, type ParsedRow } from "../lib/csv";
import {
  createBatchWithTickets,
  getTicketsByBatchPage,
  getTicketsByBatch,
  listBatches,
  type BulkWriteProgress,
} from "../lib/tickets";
import {
  downloadBatchPdf,
  revokeReadyDownload,
  type ExportProgress,
  type ReadyDownloadFile,
} from "../lib/ticketRenderer";
import { downloadBatchZipPdf, downloadBatchZipPng } from "../lib/exportZip";
import { CATEGORIES, CATEGORY_LIST } from "../lib/categories";
import { useAuth } from "../context/AuthContext";
import { TicketPreview } from "../components/TicketPreview";
import { Spinner } from "../components/Spinner";
import type { Batch, Ticket } from "../lib/types";

type Tab = "nouveau" | "lots";
type UiProgress = {
  title: string;
  label: string;
  done: number;
  total: number;
  percent: number;
};
type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

const ROW_PREVIEW_LIMIT = 120;
const GENERATED_PREVIEW_STEP = 12;
const EXISTING_PREVIEW_STEP = 10;

async function withScreenWakeLock<T>(task: () => Promise<T>): Promise<T> {
  let lock: WakeLockSentinelLike | null = null;
  try {
    lock = await (navigator as NavigatorWithWakeLock).wakeLock?.request(
      "screen",
    ) ?? null;
  } catch {
    lock = null;
  }

  try {
    return await task();
  } finally {
    if (lock) await lock.release().catch(() => {});
  }
}

function formatExportProgress(title: string, progress: ExportProgress): UiProgress {
  const percent =
    progress.percent ??
    (progress.total ? Math.round((progress.done / progress.total) * 100) : 0);
  const label =
    progress.phase === "compress"
      ? "Preparation du fichier"
      : progress.phase === "download"
        ? "Ouverture du telechargement"
        : progress.phase === "ready"
          ? "Fichier pret"
          : "Generation des billets";
  const partLabel =
    progress.parts && progress.parts > 1
      ? ` - paquet ${progress.part || 1}/${progress.parts}`
      : "";
  return {
    title,
    label: `${label}${partLabel}`,
    done: progress.done,
    total: progress.total,
    percent: Math.max(0, Math.min(100, percent)),
  };
}

function readyFileFromProgress(
  progress: ExportProgress,
): ReadyDownloadFile | null {
  if (progress.phase !== "ready" || !progress.url || !progress.fileName) {
    return null;
  }
  return {
    fileName: progress.fileName,
    url: progress.url,
    bytes: progress.bytes || 0,
    part: progress.part,
    parts: progress.parts,
  };
}

function formatBytes(bytes: number) {
  if (!bytes) return "";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function revokeFiles(files: ReadyDownloadFile[]) {
  files.forEach((file) => revokeReadyDownload(file));
}

function formatWriteProgress(progress: BulkWriteProgress): UiProgress {
  const percent = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;
  return {
    title: "Creation du lot",
    label:
      progress.phase === "preparing"
        ? "Preparation des billets"
        : `Ecriture base ${progress.batchesDone || 0}/${progress.batchesTotal || 0}`,
    done: progress.done,
    total: progress.total,
    percent,
  };
}

export default function GenerationPage() {
  const { appUser } = useAuth();
  const [tab, setTab] = useState<Tab>("nouveau");

  return (
    <div className="min-w-0">
      <div className="mb-5 flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold leading-tight text-brand-ink">
            Génération des billets
          </h1>
          <p className="mt-1 max-w-[32rem] text-sm leading-snug text-brand-ink/60">
            Importez la liste, générez les QR codes et exportez en PDF / PNG.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 rounded-xl bg-white p-1 ring-1 ring-black/5 sm:w-auto">
          <button
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${tab === "nouveau" ? "bg-brand-red text-white" : "text-brand-ink/60"}`}
            onClick={() => setTab("nouveau")}
          >
            Nouvel import
          </button>
          <button
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${tab === "lots" ? "bg-brand-red text-white" : "text-brand-ink/60"}`}
            onClick={() => setTab("lots")}
          >
            Lots existants
          </button>
        </div>
      </div>

      {tab === "nouveau" ? <NewImport user={appUser!} /> : <ExistingBatches />}
    </div>
  );
}

function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_LIST.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-black/5"
          style={{ background: c.accent, color: c.accentText }}
        >
          {c.price} · {c.label}
        </span>
      ))}
    </div>
  );
}

function ProgressCard({
  progress,
  className = "",
}: {
  progress: UiProgress;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-white p-4 ring-1 ring-black/5 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-brand-ink">
            {progress.title}
          </p>
          <p className="truncate text-xs text-brand-ink/55">
            {progress.label}
          </p>
        </div>
        <span className="shrink-0 text-sm font-extrabold text-brand-red">
          {Math.round(progress.percent)}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-brand-red transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-brand-ink/50">
        {progress.done}/{progress.total}
      </p>
    </div>
  );
}

function ReadyDownloadList({
  files,
  onClear,
}: {
  files: ReadyDownloadFile[];
  onClear: () => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-brand-ink">Telechargements prets</p>
          <p className="text-xs text-brand-ink/55">
            Si le navigateur bloque l'ouverture automatique, cliquez ici sur chaque fichier.
          </p>
        </div>
        <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={onClear}>
          Nettoyer
        </button>
      </div>
      <div className="max-h-60 divide-y divide-black/5 overflow-auto rounded-lg border border-black/5">
        {files.map((file) => (
          <a
            key={file.url}
            href={file.url}
            download={file.fileName}
            className="flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-brand-cream/60"
          >
            <span className="min-w-0 truncate font-semibold text-brand-ink">
              {file.fileName}
            </span>
            <span className="shrink-0 text-xs text-brand-ink/50">
              {formatBytes(file.bytes)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function BatchTicketPreviewGrid({
  tickets,
  total,
  loadingMore,
  onLoadMore,
}: {
  tickets: Ticket[];
  total: number;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const remaining = Math.max(0, total - tickets.length);
  const nextCount = Math.min(EXISTING_PREVIEW_STEP, remaining);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-brand-ink">Apercu telechargeable</p>
          <p className="text-sm text-brand-ink/50">
            {tickets.length}/{total} billets affiches. Les exports en haut utilisent le lot complet.
          </p>
        </div>
        {remaining > 0 && (
          <button
            className="btn-ghost w-full text-xs sm:w-auto"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            Afficher {nextCount} de plus
          </button>
        )}
      </div>
      {tickets.length === 0 ? (
        <div className="rounded-xl bg-white px-4 py-8 text-center text-sm text-brand-ink/50 ring-1 ring-black/5">
          Aucun billet dans ce lot.
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {tickets.map((ticket) => (
            <TicketPreview key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            className="btn-primary w-full sm:w-auto"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? (
              <Loader2 size={16} className="animate-spin" />
            ) : null}
            Afficher {nextCount} billets suivants
          </button>
        </div>
      )}
      <div className="mt-3 rounded-lg bg-brand-cream/70 px-3 py-2 text-xs text-brand-ink/55">
        Les previews sont chargees par paquets de {EXISTING_PREVIEW_STEP} pour garder la page fluide.
      </div>
    </div>
  );
}

function NewImport({ user }: { user: { uid: string; email: string } }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const readyDownloadsRef = useRef<ReadyDownloadFile[]>([]);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [batchName, setBatchName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Ticket[] | null>(null);
  const [generatedPreviewLimit, setGeneratedPreviewLimit] = useState(
    GENERATED_PREVIEW_STEP,
  );
  const [generateProgress, setGenerateProgress] = useState<UiProgress | null>(
    null,
  );
  const [exportJob, setExportJob] = useState<UiProgress | null>(null);
  const [readyDownloads, setReadyDownloads] = useState<ReadyDownloadFile[]>([]);
  const [error, setError] = useState("");

  const validRows = useMemo(() => rows.filter((r) => r.valid), [rows]);
  const errorRows = useMemo(() => rows.filter((r) => !r.valid), [rows]);
  const previewRows = useMemo(
    () => rows.slice(0, ROW_PREVIEW_LIMIT),
    [rows],
  );

  useEffect(() => {
    return () => revokeFiles(readyDownloadsRef.current);
  }, []);

  function clearReadyDownloads() {
    revokeFiles(readyDownloadsRef.current);
    readyDownloadsRef.current = [];
    setReadyDownloads([]);
  }

  function trackExportProgress(title: string, progress: ExportProgress) {
    setExportJob(formatExportProgress(title, progress));
    const file = readyFileFromProgress(progress);
    if (!file) return;
    readyDownloadsRef.current = [...readyDownloadsRef.current, file];
    setReadyDownloads(readyDownloadsRef.current);
  }

  function handleFile(file: File) {
    setError("");
    setGenerated(null);
    setGenerateProgress(null);
    setExportJob(null);
    clearReadyDownloads();
    setGeneratedPreviewLimit(GENERATED_PREVIEW_STEP);
    setFileName(file.name);
    if (!batchName) setBatchName(file.name.replace(/\.csv$/i, ""));
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = parseCsv(String(reader.result));
        setRows(res.rows);
        if (res.rows.length === 0)
          setError("Aucune ligne trouvée dans le fichier.");
      } catch {
        setError("Impossible de lire le fichier CSV.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function loadDevLargeCsv() {
    const categories = ["VVIP", "VIP", "Standard"];
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const lines = ["nom,categorie,email,telephone,reference,place"];

    for (let i = 1; i <= 5000; i++) {
      const n = String(i).padStart(4, "0");
      const values = [
        `Test Invite ${n}`,
        categories[(i - 1) % categories.length],
        `invite${n}@example.com`,
        `+243990${String(i).padStart(6, "0")}`,
        `TEST${stamp}-${n}`,
        `Table ${Math.ceil(i / 10)}-${((i - 1) % 10) + 1}`,
      ];
      lines.push(
        values
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      );
    }

    const file = new File([lines.join("\n")], "test-5000-tickets.csv", {
      type: "text/csv",
    });
    handleFile(file);
    setBatchName(`Test 5000 tickets ${stamp}`);
  }

  async function generate() {
    if (validRows.length === 0) return;
    setGenerating(true);
    setError("");
    setGenerateProgress({
      title: "Creation du lot",
      label: "Preparation des billets",
      done: 0,
      total: validRows.length,
      percent: 0,
    });
    try {
      const { tickets } = await createBatchWithTickets(
        batchName.trim() || `Lot du ${new Date().toLocaleDateString("fr-FR")}`,
        validRows.map((r) => ({
          holderName: r.holderName,
          category: r.category!,
          email: r.email,
          phone: r.phone,
          reference: r.reference,
          seat: r.seat,
        })),
        user,
        (progress) => setGenerateProgress(formatWriteProgress(progress)),
      );
      setGeneratedPreviewLimit(GENERATED_PREVIEW_STEP);
      setGenerated(tickets);
    } catch (e) {
      console.error(e);
      setError(
        "Échec de la génération. Vérifiez votre connexion et vos droits (rôle générateur).",
      );
    } finally {
      setGenerating(false);
      setGenerateProgress(null);
    }
  }

  async function exportAllPdf() {
    if (!generated) return;
    const title = "PDF complet";
    clearReadyDownloads();
    setExportJob({
      title,
      label: "Preparation",
      done: 0,
      total: generated.length,
      percent: 0,
    });
    try {
      await withScreenWakeLock(() =>
        downloadBatchPdf(generated, batchName.trim() || "billets", (p) =>
          trackExportProgress(title, p),
        ),
      );
    } finally {
      setExportJob(null);
    }
  }

  async function exportAllZip(kind: "png" | "pdf") {
    if (!generated) return;
    const title = kind === "png" ? "ZIP PNG" : "ZIP PDF";
    clearReadyDownloads();
    setExportJob({
      title,
      label: "Preparation",
      done: 0,
      total: generated.length,
      percent: 0,
    });
    const fn = kind === "png" ? downloadBatchZipPng : downloadBatchZipPdf;
    try {
      await withScreenWakeLock(() =>
        fn(generated, batchName.trim() || "billets", (p) =>
          trackExportProgress(title, p),
        ),
      );
    } finally {
      setExportJob(null);
    }
  }

  function reset() {
    setRows([]);
    setGenerated(null);
    setGenerateProgress(null);
    setExportJob(null);
    clearReadyDownloads();
    setGeneratedPreviewLimit(GENERATED_PREVIEW_STEP);
    setFileName("");
    setBatchName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  if (generated) {
    const visibleGenerated = generated.slice(0, generatedPreviewLimit);
    const isExporting = exportJob !== null;

    return (
      <div>
        <div className="card mb-5 grid gap-3 bg-emerald-50 ring-emerald-200 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <CheckCircle2 className="shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-semibold text-emerald-800">
                {generated.length} billet(s) généré(s) avec succès
              </p>
              <p className="text-sm text-emerald-700/80">
                Chaque billet contient un QR code unique et sécurisé.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              className="btn-primary w-full sm:w-auto"
              disabled={isExporting}
              onClick={exportAllPdf}
            >
              {isExporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileText size={16} />
              )}
              PDF (1 fichier)
            </button>
            <button
              className="btn-gold w-full sm:w-auto"
              disabled={isExporting}
              onClick={() => exportAllZip("pdf")}
            >
              {isExporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileArchive size={16} />
              )}
              PDF (.zip)
            </button>
            <button
              className="btn-gold w-full sm:w-auto"
              disabled={isExporting}
              onClick={() => exportAllZip("png")}
            >
              {isExporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileArchive size={16} />
              )}
              PNG (.zip)
            </button>
            <button className="btn-ghost col-span-2 w-full sm:col-span-1 sm:w-auto" onClick={reset}>
              Nouvel import
            </button>
          </div>
        </div>

        {exportJob && <ProgressCard progress={exportJob} className="mb-5" />}
        {readyDownloads.length > 0 && (
          <div className="mb-5">
            <ReadyDownloadList
              files={readyDownloads}
              onClear={clearReadyDownloads}
            />
          </div>
        )}

        <div className="mb-3 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-brand-ink">Apercu rapide</p>
            <p className="text-sm text-brand-ink/50">
              {visibleGenerated.length}/{generated.length} billets affiches pour garder la page fluide.
            </p>
          </div>
          {visibleGenerated.length < generated.length && (
            <button
              className="btn-ghost w-full text-xs sm:w-auto"
              onClick={() =>
                setGeneratedPreviewLimit((n) =>
                  Math.min(n + GENERATED_PREVIEW_STEP, generated.length),
                )
              }
            >
              Afficher {Math.min(GENERATED_PREVIEW_STEP, generated.length - visibleGenerated.length)} de plus
            </button>
          )}
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {visibleGenerated.map((t) => (
            <TicketPreview key={t.id} ticket={t} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        {/* Zone d'import */}
        <div
          className="card flex flex-col items-center justify-center border-2 border-dashed border-brand-red/30 bg-white px-4 py-8 text-center sm:py-10"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-red/10 text-brand-red">
            <Upload size={22} />
          </span>
          <p className="font-semibold text-brand-ink">
            Glissez votre fichier CSV ici
          </p>
          <p className="mb-4 text-sm text-brand-ink/50">ou</p>
          <div className="grid w-full max-w-sm grid-cols-2 gap-2 sm:flex sm:w-auto sm:max-w-none">
            <button
              className="btn-primary w-full"
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet size={16} /> Choisir un fichier
            </button>
            <button className="btn-ghost w-full" onClick={downloadCsvTemplate}>
              <Download size={16} /> Modèle CSV
            </button>
            {import.meta.env.DEV && (
              <button
                className="btn-ghost col-span-2 w-full text-xs sm:w-auto"
                onClick={loadDevLargeCsv}
              >
                Test 5000
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {fileName && (
            <p className="mt-3 max-w-full truncate text-xs text-brand-ink/50">
              Fichier : {fileName}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        {/* Aperçu des données */}
        {generateProgress && <ProgressCard progress={generateProgress} />}

        {rows.length > 0 && (
          <div className="card p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="font-semibold text-brand-ink">
                Apercu ({previewRows.length}/{rows.length} lignes)
              </p>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">
                  {validRows.length} valides
                </span>
                {errorRows.length > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700">
                    {errorRows.length} en erreur
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-black/5 sm:hidden">
              {previewRows.map((r) => (
                <div key={r.line} className={r.valid ? "p-4" : "bg-red-50/50 p-4"}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-brand-ink/40">
                        Ligne {r.line}
                      </p>
                      <p className="mt-0.5 break-words text-sm font-bold text-brand-ink">
                        {r.holderName || "â€”"}
                      </p>
                    </div>
                    {r.category ? (
                      <span
                        className="shrink-0 rounded px-2 py-1 text-xs font-bold"
                        style={{
                          background: CATEGORIES[r.category].accent,
                          color: CATEGORIES[r.category].accentText,
                        }}
                      >
                        {CATEGORIES[r.category].price}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs font-semibold text-red-600">
                        {r.rawCategory || "â€”"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-brand-ink/60">
                      {r.email || r.phone || "Aucun contact"}
                    </span>
                    {r.valid ? (
                      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-600">
                        <CheckCircle2 size={14} /> OK
                      </span>
                    ) : (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 font-semibold text-red-600"
                        title={r.errors.join(", ")}
                      >
                        <AlertTriangle size={14} /> {r.errors[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden max-h-[420px] overflow-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-brand-cream/80 text-xs uppercase tracking-wide text-brand-ink/50 backdrop-blur">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Nom</th>
                    <th className="px-4 py-2">Catégorie</th>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {previewRows.map((r) => (
                    <tr key={r.line} className={r.valid ? "" : "bg-red-50/50"}>
                      <td className="px-4 py-2 text-brand-ink/40">{r.line}</td>
                      <td className="px-4 py-2 font-medium text-brand-ink">
                        {r.holderName || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {r.category ? (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-bold"
                            style={{
                              background: CATEGORIES[r.category].accent,
                              color: CATEGORIES[r.category].accentText,
                            }}
                          >
                            {CATEGORIES[r.category].price}
                          </span>
                        ) : (
                          <span className="text-red-600">
                            {r.rawCategory || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-brand-ink/60">
                        {r.email || r.phone || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {r.valid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 size={14} /> OK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-red-600"
                            title={r.errors.join(", ")}
                          >
                            <AlertTriangle size={14} /> {r.errors[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Panneau latéral */}
      <div className="min-w-0 space-y-5">
        <div className="card">
          <p className="mb-3 font-semibold text-brand-ink">
            Catégories disponibles
          </p>
          <CategoryLegend />
        </div>

        <div className="card">
          <label className="label">Nom du lot</label>
          <input
            className="input"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="Ex : Préventes août 2026"
          />
          <button
            className="btn-primary mt-4 w-full"
            disabled={validRows.length === 0 || generating}
            onClick={generate}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Génération…
              </>
            ) : (
              <>
                Générer{" "}
                {validRows.length > 0 ? `${validRows.length} billet(s)` : ""}
              </>
            )}
          </button>
          <p className="mt-3 text-xs text-brand-ink/50">
            Les lignes en erreur sont ignorées. Chaque billet reçoit un
            identifiant et un jeton aléatoire infalsifiable.
          </p>
        </div>

        <div className="card text-sm text-brand-ink/60">
          <p className="mb-1.5 font-semibold text-brand-ink">
            Colonnes CSV reconnues
          </p>
          <p>
            <code className="text-brand-red">nom</code>,{" "}
            <code className="text-brand-red">categorie</code> (obligatoires),{" "}
            <code>email</code>, <code>telephone</code>, <code>reference</code>,{" "}
            <code>place</code>.
          </p>
          <p className="mt-2">
            Catégorie acceptée : <code>VVIP</code>/<code>VIP</code>/
            <code>Standard</code> ou <code>100</code>/<code>50</code>/
            <code>10</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

function ExistingBatches() {
  const readyDownloadsRef = useRef<ReadyDownloadFile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false);
  const [exportJob, setExportJob] = useState<({
    id: string;
  } & UiProgress) | null>(null);
  const [readyDownloads, setReadyDownloads] = useState<ReadyDownloadFile[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => revokeFiles(readyDownloadsRef.current);
  }, []);

  useEffect(() => {
    listBatches()
      .then(setBatches)
      .catch(() => setError("Impossible de charger les lots."))
      .finally(() => setLoading(false));
  }, []);

  function clearReadyDownloads() {
    revokeFiles(readyDownloadsRef.current);
    readyDownloadsRef.current = [];
    setReadyDownloads([]);
  }

  function trackBatchExportProgress(
    batchId: string,
    title: string,
    progress: ExportProgress,
  ) {
    setExportJob({ id: batchId, ...formatExportProgress(title, progress) });
    const file = readyFileFromProgress(progress);
    if (!file) return;
    readyDownloadsRef.current = [...readyDownloadsRef.current, file];
    setReadyDownloads(readyDownloadsRef.current);
  }

  async function open(batch: Batch) {
    if (openId === batch.id) {
      setOpenId(null);
      setTickets([]);
      return;
    }
    setOpenId(batch.id);
    setTickets([]);
    setLoadingTickets(true);
    try {
      setTickets(await getTicketsByBatchPage(batch.id, 0, EXISTING_PREVIEW_STEP));
    } finally {
      setLoadingTickets(false);
    }
  }

  async function loadMoreTickets(batch: Batch) {
    if (loadingMoreTickets || tickets.length >= batch.count) return;
    setLoadingMoreTickets(true);
    try {
      const next = await getTicketsByBatchPage(
        batch.id,
        tickets.length,
        EXISTING_PREVIEW_STEP,
      );
      setTickets((current) => [...current, ...next]);
    } catch {
      setError("Impossible de charger plus de billets.");
    } finally {
      setLoadingMoreTickets(false);
    }
  }

  async function exportAll(batch: Batch) {
    const title = "PDF complet";
    clearReadyDownloads();
    setExportJob({
      id: batch.id,
      title,
      label: "Chargement des billets",
      done: 0,
      total: batch.count,
      percent: 0,
    });
    try {
      await withScreenWakeLock(async () => {
        const list = await getTicketsByBatch(batch.id);
        await downloadBatchPdf(list, batch.name, (p) =>
          trackBatchExportProgress(batch.id, title, p),
        );
      });
    } finally {
      setExportJob(null);
    }
  }

  async function exportZip(batch: Batch, kind: "png" | "pdf") {
    const title = kind === "png" ? "ZIP PNG" : "ZIP PDF";
    clearReadyDownloads();
    setExportJob({
      id: batch.id,
      title,
      label: "Chargement des billets",
      done: 0,
      total: batch.count,
      percent: 0,
    });
    const fn = kind === "png" ? downloadBatchZipPng : downloadBatchZipPdf;
    try {
      await withScreenWakeLock(async () => {
        const list = await getTicketsByBatch(batch.id);
        await fn(list, batch.name, (p) =>
          trackBatchExportProgress(batch.id, title, p),
        );
      });
    } finally {
      setExportJob(null);
    }
  }

  if (loading) return <Spinner label="Chargement des lots…" />;
  if (error)
    return (
      <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200">
        {error}
      </div>
    );

  if (batches.length === 0)
    return (
      <div className="card flex flex-col items-center py-12 text-center text-brand-ink/50">
        <FolderOpen className="mb-3" />
        Aucun lot généré pour le moment.
      </div>
    );

  return (
    <div className="min-w-0 space-y-3">
      {readyDownloads.length > 0 && (
        <ReadyDownloadList
          files={readyDownloads}
          onClear={clearReadyDownloads}
        />
      )}
      {batches.map((b) => {
        const isBatchExporting = exportJob?.id === b.id;
        return (
        <div key={b.id} className="card p-0">
          <div className="grid gap-3 px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-brand-ink">{b.name}</p>
              <p className="truncate text-xs text-brand-ink/50">
                {b.count} billet(s) · par {b.createdByEmail}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                className="btn-ghost w-full text-xs sm:w-auto"
                disabled={isBatchExporting}
                onClick={() => exportAll(b)}
              >
                {isBatchExporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileText size={14} />
                )}{" "}
                PDF
              </button>
              <button
                className="btn-gold w-full text-xs sm:w-auto"
                disabled={isBatchExporting}
                onClick={() => exportZip(b, "pdf")}
              >
                {isBatchExporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileArchive size={14} />
                )}{" "}
                PDF .zip
              </button>
              <button
                className="btn-gold w-full text-xs sm:w-auto"
                disabled={isBatchExporting}
                onClick={() => exportZip(b, "png")}
              >
                {isBatchExporting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileArchive size={14} />
                )}{" "}
                PNG .zip
              </button>
              <button
                className="btn-primary col-span-2 w-full text-xs sm:col-span-1 sm:w-auto"
                onClick={() => open(b)}
              >
                {openId === b.id ? "Masquer" : "Voir les billets"}
              </button>
            </div>
          </div>
          {isBatchExporting && exportJob && (
            <div className="border-t border-black/5 p-4">
              <ProgressCard progress={exportJob} />
            </div>
          )}
          {openId === b.id && (
            <div className="border-t border-black/5 p-4">
              {loadingTickets ? (
                <Spinner label="Chargement des billets…" />
              ) : (
                <BatchTicketPreviewGrid
                  tickets={tickets}
                  total={b.count}
                  loadingMore={loadingMoreTickets}
                  onLoadMore={() => loadMoreTickets(b)}
                />
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
