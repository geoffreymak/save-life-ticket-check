import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  LogOut,
  QrCode,
  ScanLine,
  Users,
  Ticket,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const navBase =
  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors";

export function Layout({ children }: { children: ReactNode }) {
  const { appUser, role, logout } = useAuth();
  const navigate = useNavigate();

  const canGenerate = role === "admin" || role === "generator";
  const canVerify = role === "admin" || role === "verifier";
  const isAdmin = role === "admin";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const tabs = [
    ...(isAdmin
      ? [{ to: "/dashboard", label: "Stats", icon: LayoutDashboard }]
      : []),
    ...(canGenerate
      ? [{ to: "/generation", label: "Billets", icon: QrCode }]
      : []),
    ...(canVerify
      ? [{ to: "/verification", label: "Scanner", icon: ScanLine }]
      : []),
    ...(isAdmin ? [{ to: "/admin", label: "Users", icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-brand-cream">
      <header
        className="sticky top-0 z-20 border-b border-black/5 bg-brand-red text-white shadow-ticket"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-gold text-brand-redDark">
              <Ticket size={20} />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-extrabold uppercase tracking-wide">
                Save Life
              </p>
              <p className="truncate text-[11px] text-white/70">
                Billetterie · Journée Caritative
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {isAdmin && (
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? "bg-white text-brand-red" : "text-white/85 hover:bg-white/10"}`
                }
              >
                <LayoutDashboard size={16} /> Dashboard
              </NavLink>
            )}
            {canGenerate && (
              <NavLink
                to="/generation"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? "bg-white text-brand-red" : "text-white/85 hover:bg-white/10"}`
                }
              >
                <QrCode size={16} /> Génération
              </NavLink>
            )}
            {canVerify && (
              <NavLink
                to="/verification"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? "bg-white text-brand-red" : "text-white/85 hover:bg-white/10"}`
                }
              >
                <ScanLine size={16} /> Vérification
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? "bg-white text-brand-red" : "text-white/85 hover:bg-white/10"}`
                }
              >
                <Users size={16} /> Utilisateurs
              </NavLink>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold">{appUser?.displayName}</p>
              <p className="text-[10px] uppercase tracking-wide text-white/70">
                {role}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
              title="Se déconnecter"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl min-w-0 px-3 py-4 pb-28 sm:px-4 sm:py-5 sm:pb-6">
        {children}
      </main>

      {/* Barre d'onglets fixe (style application mobile) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex overflow-hidden border-t border-black/10 bg-white/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                isActive ? "text-brand-red" : "text-brand-ink/50"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${
                    isActive ? "bg-brand-red/10" : ""
                  }`}
                >
                  <t.icon size={20} />
                </span>
                <span className="max-w-full truncate px-1">{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
