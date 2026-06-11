import { useNavigate } from 'react-router-dom'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function PendingPage() {
  const { appUser, role, logout, refreshAppUser } = useAuth()
  const navigate = useNavigate()

  // Si entre-temps un rôle a été attribué, on redirige.
  if (role && role !== 'pending') {
    navigate('/')
  }

  return (
    <div className="flex min-h-screen min-w-0 items-center justify-center overflow-x-clip bg-brand-cream px-4 py-8 sm:p-6">
      <div className="card w-full max-w-md text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-gold/20 text-brand-red">
          <Clock size={26} />
        </span>
        <h1 className="text-xl font-extrabold text-brand-ink">Accès en attente de validation</h1>
        <p className="mt-2 text-sm text-brand-ink/60">
          Bonjour <strong>{appUser?.displayName}</strong>, votre compte (<em>{appUser?.email}</em>)
          a bien été créé. Un administrateur doit vous attribuer un rôle
          (<strong>générateur</strong> ou <strong>vérificateur</strong>) avant que vous puissiez
          accéder à la plateforme.
        </p>
        <div className="mt-6 grid gap-2 sm:flex sm:justify-center">
          <button className="btn-ghost" onClick={() => refreshAppUser().then(() => navigate('/'))}>
            <RefreshCw size={16} /> Vérifier à nouveau
          </button>
          <button className="btn-primary" onClick={() => logout().then(() => navigate('/login'))}>
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  )
}
