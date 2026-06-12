import { useEffect, useRef, useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  DoorOpen,
  KeyRound,
  Maximize2,
  Menu,
  Minimize2,
  Search,
  ScanLine,
  ShieldAlert,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { QrScanner } from "../components/QrScanner";
import { buildQrPayload, parseQrPayload } from "../lib/crypto";
import {
  findTicketByReferenceOrId,
  scanTicket,
  type ScanResult,
} from "../lib/tickets";
import { CATEGORIES, CATEGORY_LIST } from "../lib/categories";
import { getEventStats, type ComputedStats } from "../lib/stats";
import { useAuth } from "../context/AuthContext";
import type { AppTimestamp } from "../lib/types";

interface DisplayResult extends ScanResult {
  at: number;
}

function fmt(ts?: AppTimestamp): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return "—";
  }
}

function resultTitle(result: DisplayResult["result"]) {
  if (result === "admitted") return "Accès autorisé";
  if (result === "already_used") return "Déjà utilisé";
  if (result === "not_found") return "Billet introuvable";
  return "Billet invalide";
}

function scanStatus(
  result: DisplayResult | null,
  processing: boolean,
  scanActive: boolean,
) {
  if (processing) {
    return {
      label: "Vérification...",
      dot: "bg-brand-gold",
      tone: "text-brand-gold",
    };
  }
  if (result) {
    const ok = result.result === "admitted";
    return {
      label: resultTitle(result.result),
      dot: ok ? "bg-emerald-400" : "bg-brand-gold",
      tone: ok ? "text-emerald-300" : "text-brand-gold",
    };
  }
  if (scanActive) {
    return {
      label: "Prêt à scanner",
      dot: "bg-emerald-400",
      tone: "text-emerald-300",
    };
  }
  return {
    label: "Scanner en pause",
    dot: "bg-white/50",
    tone: "text-white/70",
  };
}

export default function VerificationPage() {
  const { appUser } = useAuth();
  const [scanActive, setScanActive] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [history, setHistory] = useState<DisplayResult[]>([]);
  const [manual, setManual] = useState("");
  const [autoMode, setAutoMode] = useState(true);
  const [live, setLive] = useState<ComputedStats | null>(null);
  const [searchRef, setSearchRef] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [searching, setSearching] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const scannerShellRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);

  // Stats globales temps réel (tous les billets de l'événement).
  useEffect(() => {
    let cancelled = false;
    getEventStats()
      .then((stats) => {
        if (!cancelled) setLive(stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = {
    admitted: history.filter((h) => h.result === "admitted").length,
    refused: history.filter((h) => h.result !== "admitted").length,
  };
  const currentStatus = scanStatus(result, processing, scanActive);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Mode auto : réarme le scanner automatiquement après affichage du résultat.
  useEffect(() => {
    if (!autoMode || !result) return;
    const delay = result.result === "admitted" ? 1800 : 3500;
    const t = setTimeout(() => next(), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, autoMode]);

  function openFocusMode() {
    setFocusMode(true);
    setFocusMenuOpen(false);
    const el = scannerShellRef.current;
    if (el?.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
  }

  function closeFocusMode() {
    setFocusMenuOpen(false);
    setFocusMode(false);
    if (document.fullscreenElement === scannerShellRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }

  async function searchByReference(e: React.FormEvent) {
    e.preventDefault();
    setSearchMsg("");
    const ref = searchRef.trim();
    if (!ref) return;
    setSearching(true);
    try {
      const found = await findTicketByReferenceOrId(ref);
      if (!found) {
      setSearchMsg("Aucun billet trouvé pour cette référence.");
        return;
      }
      setSearchRef("");
      process(buildQrPayload(found.id, found.secret));
    } catch {
      setSearchMsg("Recherche impossible pour le moment.");
    } finally {
      setSearching(false);
    }
  }

  function updateLiveAfterScan(res: ScanResult) {
    setLive((prev) => {
      if (!prev) return prev;
      const next: ComputedStats = {
        ...prev,
        byCategory: { ...prev.byCategory },
      };

      if (res.result === "admitted" && res.ticket) {
        const cat = { ...next.byCategory[res.ticket.category] };
        cat.used += 1;
        cat.remaining = Math.max(0, cat.total - cat.used);
        next.byCategory[res.ticket.category] = cat;
        next.used += 1;
        next.remaining = Math.max(0, next.total - next.used);
        next.admittedScans += 1;
        next.scansTotal += 1;
      } else if (res.result === "already_used") {
        next.refusedScans += 1;
        next.scansTotal += 1;
      }

      return next;
    });
  }

  async function process(text: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    setFocusMenuOpen(false);
    setProcessing(true);
    setScanActive(false);
    try {
      const parsed = parseQrPayload(text);
      let res: ScanResult;
      if (!parsed) {
        res = { result: "invalid" };
      } else {
        res = await scanTicket(parsed.id, parsed.secret, {
          uid: appUser!.uid,
          email: appUser!.email,
        });
      }
      const display: DisplayResult = { ...res, at: Date.now() };
      setResult(display);
      setHistory((prev) => [display, ...prev].slice(0, 30));
      updateLiveAfterScan(res);
      beep(res.result === "admitted");
    } catch (e) {
      console.error(e);
      setResult({ result: "invalid", at: Date.now() });
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  }

  function next() {
    setFocusMenuOpen(false);
    setResult(null);
    setScanActive(true);
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manual.trim()) {
      process(manual.trim());
      setManual("");
    }
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Colonne scanner */}
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
              <ScanLine size={20} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold leading-tight text-brand-ink sm:text-xl">
                Vérification des accès
              </h1>
              <p className="mt-1 max-w-[28rem] text-sm leading-snug text-brand-ink/60">
                Scannez le QR code du billet pour contrôler l'entrée.
              </p>
            </div>
          </div>
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            <button
              onClick={openFocusMode}
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-brand-ink px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-black sm:px-3"
              title="Ouvrir le scanner en plein écran"
            >
              <Maximize2 size={14} className="shrink-0" />
              <span className="truncate">Plein écran</span>
            </button>
            <button
              onClick={() => setAutoMode((v) => !v)}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors sm:px-3 ${
                autoMode
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-brand-ink/60 ring-1 ring-black/10"
              }`}
              title="Réarme automatiquement le scanner après chaque billet"
            >
              <Zap size={14} className="shrink-0" />
              <span className="truncate">Auto {autoMode ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        <div
          ref={scannerShellRef}
          className={
            focusMode
              ? "fixed inset-0 z-50 flex h-[100dvh] flex-col bg-black text-white"
              : "relative"
          }
        >
          <div
            className={
              focusMode
                ? "flex items-center justify-between gap-2 border-b border-white/10 bg-black/90 px-3 py-2 backdrop-blur"
                : "hidden"
            }
            style={{
              paddingTop: focusMode
                ? "calc(env(safe-area-inset-top) + 0.5rem)"
                : undefined,
            }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">Scanner</p>
              <p
                className={`flex items-center gap-1.5 text-xs font-semibold ${currentStatus.tone}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${currentStatus.dot}`}
                />
                {currentStatus.label}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAutoMode((v) => !v)}
                className={`grid h-10 w-10 place-items-center rounded-xl ${
                  autoMode
                    ? "bg-emerald-500 text-white"
                    : "bg-white/10 text-white"
                }`}
                title="Mode auto"
              >
                <Zap size={17} />
              </button>
              <button
                onClick={() => setFocusMenuOpen((v) => !v)}
                className={`grid h-10 w-10 place-items-center rounded-xl ${
                  focusMenuOpen
                    ? "bg-white text-brand-ink"
                    : "bg-white/10 text-white"
                }`}
                title="Menu rapide"
              >
                {focusMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              <button
                onClick={closeFocusMode}
                className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white"
                title="Quitter le plein écran"
              >
                <Minimize2 size={18} />
              </button>
            </div>
          </div>

          <div className={focusMode ? "relative min-h-0 flex-1" : "relative"}>
            <QrScanner
              onResult={process}
              active={scanActive && !result}
              fullscreen={focusMode}
            />
            {result && (
              <ResultOverlay
                result={result}
                onNext={next}
                fullscreen={focusMode}
              />
            )}
            {processing && !result && (
              <div
                className={`absolute inset-0 grid place-items-center bg-black/50 text-white ${
                  focusMode ? "rounded-none text-lg font-bold" : "rounded-2xl"
                }`}
              >
                Vérification…
              </div>
            )}
          </div>

          <div
            className={
              focusMode
                ? "border-t border-white/10 bg-black/90 px-3 py-2 backdrop-blur"
                : "hidden"
            }
            style={{
              paddingBottom: focusMode
                ? "calc(env(safe-area-inset-bottom) + 0.5rem)"
                : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-white">
                  {stats.admitted} admis · {stats.refused} refusés
                </p>
                <p className="truncate text-white/60">
                  Global : {live?.used ?? 0}/{live?.total ?? 0} entres
                </p>
              </div>
              <button
                onClick={result ? next : () => setScanActive((v) => !v)}
                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-brand-ink"
              >
                {result ? "Suivant" : scanActive ? "Pause" : "Reprendre"}
              </button>
            </div>
          </div>

          <div
            className={
              focusMode && focusMenuOpen
                ? "absolute inset-x-3 bottom-20 z-20 rounded-xl bg-white p-3 text-brand-ink shadow-2xl ring-1 ring-black/10"
                : "hidden"
            }
          >
            <form onSubmit={submitManual} className="mb-3 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="label">QR manuel</label>
                <input
                  className="input"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="identifiant.jeton"
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={processing}
              >
                OK
              </button>
            </form>
            <form onSubmit={searchByReference} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="label">Référence</label>
                <input
                  className="input"
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value)}
                  placeholder="SL-0001"
                />
                {searchMsg && (
                  <p className="mt-1 text-xs font-medium text-brand-red">
                    {searchMsg}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="btn-ghost"
                disabled={processing || searching}
              >
                {searching ? "..." : "OK"}
              </button>
            </form>
          </div>
        </div>

        {/* Saisie manuelle */}
        <form
          onSubmit={submitManual}
          className="card grid gap-3 sm:flex sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <label className="label">Saisie manuelle (contenu du QR)</label>
            <div className="relative">
              <KeyRound
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-brand-ink/40"
              />
              <input
                className="input pl-9"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="identifiant.jeton"
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary w-full sm:w-auto"
            disabled={processing}
          >
            Vérifier
          </button>
        </form>

        {/* Recherche par référence (billet papier sans QR lisible) */}
        <form
          onSubmit={searchByReference}
          className="card grid gap-3 sm:flex sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <label className="label">Rechercher par référence</label>
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-brand-ink/40"
              />
              <input
                className="input pl-9"
                value={searchRef}
                onChange={(e) => setSearchRef(e.target.value)}
                placeholder="Ex : SL-0001"
              />
            </div>
            {searchMsg && (
              <p className="mt-1 text-xs font-medium text-brand-red">
                {searchMsg}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn-ghost w-full sm:w-auto"
            disabled={processing || searching}
          >
            {searching ? "Recherche..." : "Valider"}
          </button>
        </form>
      </div>

      {/* Colonne stats + historique */}
      <div className="min-w-0 space-y-4">
        {/* Stats globales temps réel */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex min-w-0 items-center gap-2 font-semibold text-brand-ink">
              <DoorOpen size={18} className="text-emerald-600" /> Entrées (temps
              réel)
            </p>
            <span className="text-sm font-bold text-brand-ink">
              {live?.used ?? 0}/{live?.total ?? 0}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{
                width: `${live?.total ? ((live?.used ?? 0) / live.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            {CATEGORY_LIST.map((c) => {
              const s = live?.byCategory[c.id] ?? {
                id: c.id,
                total: 0,
                used: 0,
                remaining: 0,
              };
              return (
                <div
                  key={c.id}
                  className="flex min-w-0 items-center justify-between gap-2 text-xs"
                >
                  <span
                    className="rounded px-1.5 py-0.5 font-bold"
                    style={{ background: c.accent, color: c.accentText }}
                  >
                    {c.price}
                  </span>
                  <span className="min-w-0 text-right text-brand-ink/60">
                    <span className="font-semibold text-emerald-700">
                      {s.used}
                    </span>{" "}
                    / {s.total} entrés · {s.remaining} restants
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3">
          <div className="card text-center">
            <p className="text-3xl font-extrabold text-emerald-600">
              {stats.admitted}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
              Admis
            </p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-extrabold text-brand-red">
              {stats.refused}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
              Refusés
            </p>
          </div>
        </div>

        <div className="card p-0">
          <p className="border-b border-black/5 px-4 py-3 font-semibold text-brand-ink">
            Historique de la session
          </p>
          <div className="max-h-[460px] divide-y divide-black/5 overflow-auto">
            {history.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-brand-ink/40">
                Aucun scan pour le moment.
              </p>
            )}
            {history.map((h, i) => (
              <HistoryRow key={i} item={h} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultOverlay({
  result,
  onNext,
  fullscreen = false,
}: {
  result: DisplayResult;
  onNext: () => void;
  fullscreen?: boolean;
}) {
  const r = result.result;
  const ticket = result.ticket;
  const cfg = ticket ? CATEGORIES[ticket.category] : null;

  const theme =
    r === "admitted"
      ? { bg: "bg-emerald-600", Icon: CheckCircle2, title: "ACCÈS AUTORISÉ" }
      : r === "already_used"
        ? { bg: "bg-orange-500", Icon: ShieldAlert, title: "DÉJÀ UTILISÉ" }
        : r === "not_found"
          ? { bg: "bg-brand-red", Icon: XCircle, title: "BILLET INTROUVABLE" }
          : {
              bg: "bg-brand-redDark",
              Icon: AlertOctagon,
              title: "BILLET INVALIDE",
            };

  const Icon = theme.Icon;

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center ${theme.bg} text-center text-white ${
        fullscreen ? "rounded-none px-5 py-10" : "rounded-2xl p-6"
      }`}
    >
      <Icon size={fullscreen ? 72 : 56} className="mb-2" />
      <p
        className={`font-display tracking-wide ${
          fullscreen ? "text-4xl sm:text-5xl" : "text-3xl"
        }`}
      >
        {theme.title}
      </p>

      {ticket && (
        <div
          className={`mt-3 w-full rounded-xl bg-black/15 p-3 text-left ${
            fullscreen ? "max-w-sm text-base" : "max-w-xs text-sm"
          }`}
        >
          <p
            className={`font-bold leading-tight ${
              fullscreen ? "text-2xl" : "text-lg"
            }`}
          >
            {ticket.holderName}
          </p>
          <p className="text-white/80">
            {cfg?.price} · {cfg?.label}
          </p>
          {ticket.reference && (
            <p className="text-white/70">Réf : {ticket.reference}</p>
          )}
          {ticket.seat && (
            <p className="text-white/70">Place : {ticket.seat}</p>
          )}
        </div>
      )}

      {r === "already_used" && (
        <div
          className={`mt-3 w-full rounded-xl bg-black/25 p-3 text-left ${
            fullscreen ? "max-w-sm text-base" : "max-w-xs text-sm"
          }`}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock size={14} /> Premier passage
          </p>
          <p className="text-white/80">{fmt(result.firstScanAt)}</p>
          <p className="text-white/80">
            Par : {result.firstScanByEmail || "inconnu"}
          </p>
          <p className="mt-1 text-white/70">
            Nombre de scans : {result.scanCount}
          </p>
        </div>
      )}

      <button
        onClick={onNext}
        className={`mt-5 rounded-xl bg-white font-bold text-brand-ink shadow hover:bg-white/90 ${
          fullscreen ? "px-8 py-3 text-base" : "px-6 py-2.5 text-sm"
        }`}
      >
        Scanner le suivant
      </button>
    </div>
  );
}

function HistoryRow({ item }: { item: DisplayResult }) {
  const ticket = item.ticket;
  const r = item.result;
  const meta =
    r === "admitted"
      ? { cls: "text-emerald-600", Icon: CheckCircle2, label: "Admis" }
      : r === "already_used"
        ? { cls: "text-orange-500", Icon: ShieldAlert, label: "Déjà utilisé" }
        : {
            cls: "text-brand-red",
            Icon: XCircle,
            label: r === "not_found" ? "Introuvable" : "Invalide",
          };
  const Icon = meta.Icon;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Icon size={18} className={meta.cls} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-ink">
          {ticket?.holderName || "Billet inconnu"}
        </p>
        <p className="text-xs text-brand-ink/50">
          {ticket?.reference ? `${ticket.reference} · ` : ""}
          {new Date(item.at).toLocaleTimeString("fr-FR")}
        </p>
      </div>
      <span className={`text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
    </div>
  );
}

let audioCtx: AudioContext | null = null;
function beep(ok: boolean) {
  try {
    audioCtx ||= new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(audioCtx.currentTime + (ok ? 0.12 : 0.3));
  } catch {
    /* ignore */
  }
}
