import { useEffect, useState } from 'react'
import { ShieldCheck, QrCode, ScanLine, Clock, UserCog } from 'lucide-react'
import { listUsers, setUserRole } from '../lib/users'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/Spinner'
import type { AppUser, Role } from '../lib/types'

const ROLE_META: Record<Role, { label: string; icon: typeof ShieldCheck; cls: string }> = {
  admin: { label: 'Administrateur', icon: ShieldCheck, cls: 'bg-brand-red text-white' },
  generator: { label: 'Générateur', icon: QrCode, cls: 'bg-brand-gold text-brand-ink' },
  verifier: { label: 'Vérificateur', icon: ScanLine, cls: 'bg-emerald-600 text-white' },
  pending: { label: 'En attente', icon: Clock, cls: 'bg-black/10 text-brand-ink' },
}

export default function AdminPage() {
  const { appUser } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [savingUid, setSavingUid] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setUsers(await listUsers())
    } catch {
      setError("Impossible de charger les utilisateurs. Vérifiez vos droits d'administrateur.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function changeRole(uid: string, role: Role) {
    setSavingUid(uid)
    try {
      await setUserRole(uid, role)
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role } : u)))
    } catch {
      setError('Échec de la mise à jour du rôle.')
    } finally {
      setSavingUid(null)
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-6 flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-red text-white">
          <UserCog size={20} />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-brand-ink">Gestion des utilisateurs</h1>
          <p className="text-sm text-brand-ink/60">
            Attribuez les rôles d'accès. Seuls les administrateurs voient cette page.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <Spinner label="Chargement des utilisateurs…" />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full text-left text-sm">
              <thead className="bg-brand-cream/60 text-xs uppercase tracking-wide text-brand-ink/50">
                <tr>
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Rôle actuel</th>
                  <th className="px-4 py-3">Changer le rôle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {users.map((u) => {
                  const meta = ROLE_META[u.role]
                  const Icon = meta.icon
                  const isSelf = u.uid === appUser?.uid
                  return (
                    <tr key={u.uid}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brand-ink">
                          {u.displayName} {isSelf && <span className="text-brand-ink/40">(vous)</span>}
                        </p>
                        <p className="text-xs text-brand-ink/50">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>
                          <Icon size={13} /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="input max-w-[200px] py-2"
                          value={u.role}
                          disabled={savingUid === u.uid || isSelf}
                          onChange={(e) => changeRole(u.uid, e.target.value as Role)}
                          title={isSelf ? 'Vous ne pouvez pas modifier votre propre rôle.' : ''}
                        >
                          <option value="pending">En attente</option>
                          <option value="verifier">Vérificateur</option>
                          <option value="generator">Générateur</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-brand-ink/50">
                      Aucun utilisateur.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
