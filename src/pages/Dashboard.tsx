import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  DoorOpen,
  ShieldAlert,
  Ticket as TicketIcon,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeStats,
  subscribeRecentScans,
  subscribeTickets,
  type LiveScan,
} from "../lib/stats";
import { CATEGORIES, CATEGORY_LIST } from "../lib/categories";
import { Spinner } from "../components/Spinner";
import type { Ticket } from "../lib/types";

export default function DashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [scans, setScans] = useState<LiveScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  useEffect(() => {
    const unsubT = subscribeTickets(
      (t) => {
        setTickets(t);
        setLoading(false);
        setUpdatedAt(Date.now());
      },
      () => {
        setError(
          "Impossible de charger les statistiques (droits insuffisants ?).",
        );
        setLoading(false);
      },
    );
    const unsubS = subscribeRecentScans(
      (s) => setScans(s),
      60,
      () => {},
    );
    return () => {
      unsubT();
      unsubS();
    };
  }, []);

  const stats = useMemo(() => computeStats(tickets, scans), [tickets, scans]);
  const ticketMap = useMemo(() => {
    const m = new Map<string, Ticket>();
    for (const t of tickets) m.set(t.id, t);
    return m;
  }, [tickets]);

  if (loading)
    return <Spinner label="Connexion aux statistiques en temps réel…" />;
  if (error)
    return (
      <div className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200">
        {error}
      </div>
    );

  const entryRate = stats.total
    ? Math.round((stats.used / stats.total) * 100)
    : 0;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-brand-ink">
            Tableau de bord
          </h1>
          <p className="text-sm text-brand-ink/60">
            Statistiques de l'événement en temps réel.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          En direct · maj {new Date(updatedAt).toLocaleTimeString("fr-FR")}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={TicketIcon}
          label="Billets émis"
          value={stats.total}
          color="#1c1410"
          tint="bg-black/5"
        />
        <Kpi
          icon={DoorOpen}
          label="Entrés"
          value={stats.used}
          color="#047857"
          tint="bg-emerald-50"
        />
        <Kpi
          icon={CheckCircle2}
          label="Pas encore entrés"
          value={stats.remaining}
          color="#B11116"
          tint="bg-brand-red/5"
        />
        <Kpi
          icon={ShieldAlert}
          label="Refus (doublons)"
          value={stats.refusedScans}
          color="#ea580c"
          tint="bg-orange-50"
        />
      </div>

      {/* Taux d'entrée */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 font-semibold text-brand-ink">
            <TrendingUp size={18} className="text-brand-red" /> Taux d'entrée
            global
          </p>
          <span className="text-sm font-bold text-brand-ink">{entryRate}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-red transition-all"
            style={{ width: `${entryRate}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-brand-ink/50">
          {stats.used} entrés sur {stats.total} billets émis.
        </p>
      </div>

      {/* Graphiques */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <p className="mb-3 font-semibold text-brand-ink">
            Répartition par catégorie
          </p>
          {stats.total === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={CATEGORY_LIST.map((c) => ({
                    name: c.price,
                    value: stats.byCategory[c.id].total,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {CATEGORY_LIST.map((c) => (
                    <Cell key={c.id} fill={c.accent} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card overflow-hidden">
          <p className="mb-3 font-semibold text-brand-ink">
            Entrés vs Restants par catégorie
          </p>
          {stats.total === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={CATEGORY_LIST.map((c) => ({
                  name: c.price,
                  Entrés: stats.byCategory[c.id].used,
                  Restants: stats.byCategory[c.id].remaining,
                }))}
              >
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="Entrés"
                  stackId="a"
                  fill="#047857"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Restants"
                  stackId="a"
                  fill="#d1c4ad"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Détail par catégorie + flux live */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          {CATEGORY_LIST.map((c) => {
            const s = stats.byCategory[c.id];
            const pct = s.total ? Math.round((s.used / s.total) * 100) : 0;
            return (
              <div key={c.id} className="card">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold"
                      style={{ background: c.accent, color: c.accentText }}
                    >
                      {c.price}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-brand-ink">
                      {c.label}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-brand-ink">
                    {pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: c.accent }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-brand-ink/60">
                  <span>{s.total} émis</span>
                  <span className="text-emerald-700">{s.used} entrés</span>
                  <span className="text-brand-red">{s.remaining} restants</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card p-0">
          <p className="flex items-center gap-2 border-b border-black/5 px-4 py-3 font-semibold text-brand-ink">
            <Activity size={16} className="text-emerald-600" /> Activité en
            direct
          </p>
          <div className="max-h-[420px] divide-y divide-black/5 overflow-auto">
            {scans.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-brand-ink/40">
                Aucun scan pour le moment.
              </p>
            )}
            {scans.map((s) => {
              const t = ticketMap.get(s.ticketId);
              const cat = t ? CATEGORIES[t.category] : null;
              const admitted = s.result === "admitted";
              return (
                <div key={s.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${admitted ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-600"}`}
                  >
                    {admitted ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <ShieldAlert size={16} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-ink">
                      {t?.holderName || "Billet"}
                    </p>
                    <p className="text-xs text-brand-ink/50">
                      {cat ? `${cat.price} · ` : ""}
                      {s.at?.toDate
                        ? s.at.toDate().toLocaleTimeString("fr-FR")
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold ${admitted ? "text-emerald-600" : "text-orange-600"}`}
                  >
                    {admitted ? "Admis" : "Doublon"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  color,
  tint,
}: {
  icon: typeof TicketIcon;
  label: string;
  value: number;
  color: string;
  tint: string;
}) {
  return (
    <div className="card flex min-w-0 items-center gap-3">
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tint}`}
        style={{ color }}
      >
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none" style={{ color }}>
          {value}
        </p>
        <p className="mt-1 truncate text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
          {label}
        </p>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-brand-ink/40">
      Aucune donnée à afficher.
    </div>
  );
}
