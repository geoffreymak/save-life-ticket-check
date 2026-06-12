import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AppUser, Role } from '../lib/types'

interface AuthContextValue {
  user: User | null
  appUser: AppUser | null
  loading: boolean
  role: Role | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  refreshAppUser: () => Promise<void>
}

type DbProfile = {
  id: string
  email: string | null
  display_name: string | null
  role: Role | null
  created_at: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function displayNameFor(user: User) {
  return (
    (user.user_metadata?.display_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split('@')[0] ||
    'Utilisateur'
  )
}

function toAppUser(user: User, profile: DbProfile): AppUser {
  return {
    uid: user.id,
    email: profile.email || user.email || '',
    displayName: profile.display_name || displayNameFor(user),
    role: profile.role || 'pending',
    createdAt: profile.created_at || undefined,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadAppUser(u: User): Promise<AppUser> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,role,created_at')
      .eq('id', u.id)
      .maybeSingle()

    if (error) throw error
    if (data) return toAppUser(u, data as DbProfile)

    const fresh = {
      id: u.id,
      email: u.email || '',
      display_name: displayNameFor(u),
      role: 'pending' as Role,
    }
    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert(fresh)
      .select('id,email,display_name,role,created_at')
      .single()
    if (insertError) throw insertError
    return toAppUser(u, created as DbProfile)
  }

  async function handleUser(nextUser: User | null) {
    setUser(nextUser)
    if (!nextUser) {
      setAppUser(null)
      setLoading(false)
      return
    }

    try {
      setAppUser(await loadAppUser(nextUser))
    } catch (e) {
      console.error('Chargement du profil echoue', e)
      setAppUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) handleUser(data.session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) handleUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      appUser,
      loading,
      role: appUser?.role ?? null,
      async login(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      },
      async signup(email, password, displayName) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName },
          },
        })
        if (error) throw error
        if (data.user && data.session) await loadAppUser(data.user)
      },
      async logout() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
      async refreshAppUser() {
        if (user) setAppUser(await loadAppUser(user))
      },
    }),
    [user, appUser, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit etre utilise dans <AuthProvider>')
  return ctx
}
