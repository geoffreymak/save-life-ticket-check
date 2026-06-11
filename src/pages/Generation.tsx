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
  getTicketsByBatch,
  listBatches,
} from "../lib/tickets";
import { downloadBatchPdf } from "../lib/ticketRenderer";
import { downloadBatchZipPdf, downloadBatchZipPng } from "../lib/exportZip";
import { CATEGORIES, CATEGORY_LIST } from "../lib/categories";
import { useAuth } from "../context/AuthContext";
import { TicketPreview } from "../components/TicketPreview";
import { Spinner } from "../components/Spinner";
import type { Batch, Ticket } from "../lib/types";

type Tab = "nouveau" | "lots";

export default function GenerationPage() {
  const { appUser } = useAuth();
  const [tab, setTab] = useState<Tab>("nouveau");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-ink">
            Génération des billets
          </h1>
          <p className="text-sm text-brand-ink/60">
            Importez la liste, générez les QR codes et exportez en PDF / PNG.
          </p>
        </div>
        <div className="flex rounded-xl bg-white p-1 ring-1 ring-black/5">
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

function NewImport({ user }: { user: { uid: string; email: string } }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [batchName, setBatchName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Ticket[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [zipping, setZipping] = useState<{
    kind: "png" | "pdf";
    done: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState("");

  const validRows = useMemo(() => rows.filter((r) => r.valid), [rows]);
  const errorRows = useMemo(() => rows.filter((r) => !r.valid), [rows]);

  function handleFile(file: File) {
    setError("");
    setGenerated(null);
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

  async function generate() {
    if (validRows.length === 0) return;
    setGenerating(true);
    setError("");
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
      );
      setGenerated(tickets);
    } catch (e) {
      console.error(e);
      setError(
        "Échec de la génération. Vérifiez votre connexion et vos droits (rôle générateur).",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function exportAllPdf() {
    if (!generated) return;
    setExporting(true);
    try {
      await downloadBatchPdf(generated, batchName.trim() || "billets");
    } finally {
      setExporting(false);
    }
  }

  async function exportAllZip(kind: "png" | "pdf") {
    if (!generated) return;
    setZipping({ kind, done: 0, total: generated.length });
    const fn = kind === "png" ? downloadBatchZipPng : downloadBatchZipPdf;
    try {
      await fn(generated, batchName.trim() || "billets", (done, total) =>
        setZipping({ kind, done, total }),
      );
    } finally {
      setZipping(null);
    }
  }

  function reset() {
    setRows([]);
    setGenerated(null);
    setFileName("");
    setBatchName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  if (generated) {
    return (
      <div>
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 ring-emerald-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">
                {generated.length} billet(s) généré(s) avec succès
              </p>
              <p className="text-sm text-emerald-700/80">
                Chaque billet contient un QR code unique et sécurisé.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={exporting}
              onClick={exportAllPdf}
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileText size={16} />
              )}
              PDF (1 fichier)
            </button>
            <button
              className="btn-gold"
              disabled={zipping !== null}
              onClick={() => exportAllZip("pdf")}
            >
              {zipping?.kind === "pdf" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileArchive size={16} />
              )}
              {zipping?.kind === "pdf"
                ? `PDF ${zipping.done}/${zipping.total}`
                : "PDF (.zip)"}
            </button>
            <button
              className="btn-gold"
              disabled={zipping !== null}
              onClick={() => exportAllZip("png")}
            >
              {zipping?.kind === "png" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileArchive size={16} />
              )}
              {zipping?.kind === "png"
                ? `PNG ${zipping.done}/${zipping.total}`
                : "PNG (.zip)"}
            </button>
            <button className="btn-ghost" onClick={reset}>
              Nouvel import
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {generated.map((t) => (
            <TicketPreview key={t.id} ticket={t} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {/* Zone d'import */}
        <div
          className="card flex flex-col items-center justify-center border-2 border-dashed border-brand-red/30 bg-white py-10 text-center"
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
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet size={16} /> Choisir un fichier
            </button>
            <button className="btn-ghost" onClick={downloadCsvTemplate}>
              <Download size={16} /> Modèle CSV
            </button>
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
            <p className="mt-3 text-xs text-brand-ink/50">
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
        {rows.length > 0 && (
          <div className="card p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="font-semibold text-brand-ink">
                Aperçu ({rows.length} lignes)
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
            <div className="max-h-[420px] overflow-auto">
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
                  {rows.map((r) => (
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
      <div className="space-y-5">
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
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{
    id: string;
    kind: "png" | "pdf";
    done: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listBatches()
      .then(setBatches)
      .catch(() => setError("Impossible de charger les lots."))
      .finally(() => setLoading(false));
  }, []);

  async function open(batch: Batch) {
    if (openId === batch.id) {
      setOpenId(null);
      return;
    }
    setOpenId(batch.id);
    setLoadingTickets(true);
    try {
      setTickets(await getTicketsByBatch(batch.id));
    } finally {
      setLoadingTickets(false);
    }
  }

  async function listFor(batch: Batch) {
    return tickets.length && openId === batch.id
      ? tickets
      : await getTicketsByBatch(batch.id);
  }

  async function exportAll(batch: Batch) {
    setExporting(batch.id);
    try {
      await downloadBatchPdf(await listFor(batch), batch.name);
    } finally {
      setExporting(null);
    }
  }

  async function exportZip(batch: Batch, kind: "png" | "pdf") {
    const list = await listFor(batch);
    setZipping({ id: batch.id, kind, done: 0, total: list.length });
    const fn = kind === "png" ? downloadBatchZipPng : downloadBatchZipPdf;
    try {
      await fn(list, batch.name, (done, total) =>
        setZipping({ id: batch.id, kind, done, total }),
      );
    } finally {
      setZipping(null);
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
    <div className="space-y-3">
      {batches.map((b) => (
        <div key={b.id} className="card p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-semibold text-brand-ink">{b.name}</p>
              <p className="text-xs text-brand-ink/50">
                {b.count} billet(s) · par {b.createdByEmail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost text-xs"
                disabled={exporting === b.id}
                onClick={() => exportAll(b)}
              >
                {exporting === b.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileText size={14} />
                )}{" "}
                PDF
              </button>
              <button
                className="btn-gold text-xs"
                disabled={zipping?.id === b.id}
                onClick={() => exportZip(b, "pdf")}
              >
                {zipping?.id === b.id && zipping.kind === "pdf" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileArchive size={14} />
                )}{" "}
                {zipping?.id === b.id && zipping.kind === "pdf"
                  ? `${zipping.done}/${zipping.total}`
                  : "PDF .zip"}
              </button>
              <button
                className="btn-gold text-xs"
                disabled={zipping?.id === b.id}
                onClick={() => exportZip(b, "png")}
              >
                {zipping?.id === b.id && zipping.kind === "png" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileArchive size={14} />
                )}{" "}
                {zipping?.id === b.id && zipping.kind === "png"
                  ? `${zipping.done}/${zipping.total}`
                  : "PNG .zip"}
              </button>
              <button className="btn-primary text-xs" onClick={() => open(b)}>
                {openId === b.id ? "Masquer" : "Voir les billets"}
              </button>
            </div>
          </div>
          {openId === b.id && (
            <div className="border-t border-black/5 p-4">
              {loadingTickets ? (
                <Spinner label="Chargement des billets…" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {tickets.map((t) => (
                    <TicketPreview key={t.id} ticket={t} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
