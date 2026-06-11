import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Ticket, Mail, Lock, User as UserIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { FullScreenLoader } from '../components/Spinner'

function frError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cet e-mail.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail.',
    'auth/weak-password': 'Mot de passe trop faible (min. 6 caractères).',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
  }
  return map[code] || 'Une erreur est survenue. Réessayez.'
}

export default function LoginPage() {
  const { user, loading, login, signup } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <FullScreenLoader />
  if (user) return <Navigate to="/" replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') await login(email, password)
      else await signup(email, password, name)
      navigate('/')
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || ''
      setError(frError(code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen min-w-0 overflow-x-clip md:grid-cols-2">
      {/* Panneau visuel inspiré du billet */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-red p-10 text-white md:flex">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-gold/20 blur-2xl" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-black/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gold text-brand-redDark">
            <Ticket />
          </span>
          <div>
            <p className="font-extrabold uppercase tracking-wide">Fondation Save Life</p>
            <p className="text-sm text-white/70">Plateforme de billetterie</p>
          </div>
        </div>
        <div className="relative">
          <p className="font-display text-5xl leading-none">JOURNÉE</p>
          <p className="font-display text-5xl leading-none text-brand-gold">CARITATIVE</p>
          <p className="mt-4 max-w-sm text-white/80">
            «&nbsp;Ensemble changeons des vies&nbsp;» — Génération sécurisée et vérification
            anti-fraude des billets par QR code.
          </p>
        </div>
        <p className="relative text-xs text-white/60">22 août 2026 · Académie de Beaux Arts</p>
      </div>

      {/* Formulaire */}
      <div className="flex min-w-0 items-center justify-center bg-brand-cream px-4 py-8 sm:p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-6 md:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-red text-white">
              <Ticket />
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-ink">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="mb-6 mt-1 text-sm text-brand-ink/60">
            {mode === 'login'
              ? 'Accédez à votre espace selon votre rôle.'
              : 'Votre accès sera activé par un administrateur.'}
          </p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}

          {mode === 'signup' && (
            <div className="mb-4">
              <label className="label">Nom complet</label>
              <div className="relative">
                <UserIcon size={16} className="pointer-events-none absolute left-3 top-3 text-brand-ink/40" />
                <input
                  className="input pl-9"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom"
                  required
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="label">E-mail</label>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-3 text-brand-ink/40" />
              <input
                type="email"
                className="input pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="label">Mot de passe</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3 top-3 text-brand-ink/40" />
              <input
                type="password"
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
          </button>

          <p className="mt-5 text-center text-sm text-brand-ink/60">
            {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
            <button
              type="button"
              className="font-semibold text-brand-red hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? "S'inscrire" : 'Se connecter'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
