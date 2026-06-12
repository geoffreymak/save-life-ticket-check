import { supabase } from './supabase'
import type { AppUser, Role } from './types'

type DbProfile = {
  id: string
  email: string | null
  display_name: string | null
  role: Role | null
  created_at: string | null
}

function toAppUser(row: DbProfile): AppUser {
  return {
    uid: row.id,
    email: row.email || '',
    displayName: row.display_name || '',
    role: row.role || 'pending',
    createdAt: row.created_at || undefined,
  }
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,display_name,role,created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toAppUser(row as DbProfile))
}

export async function setUserRole(uid: string, role: Role): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', uid)

  if (error) throw error
}
