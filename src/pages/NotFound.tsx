import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col items-center justify-center overflow-x-clip bg-brand-cream px-4 py-8 text-center sm:p-6">
      <p className="font-display text-7xl text-brand-red">404</p>
      <p className="mt-2 text-brand-ink/70">Cette page n'existe pas.</p>
      <Link to="/" className="btn-primary mt-6">
        Retour à l'accueil
      </Link>
    </div>
  )
}
