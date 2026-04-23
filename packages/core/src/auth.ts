import type { SupabaseClient, AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function signUp(supabase: TypedClient, input: { email: string; password: string }) {
  const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password })
  if (error) throw error
  return data
}

export async function signIn(supabase: TypedClient, input: { email: string; password: string }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password })
  if (error) throw error
  return data
}

export async function signOut(supabase: TypedClient) {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession(supabase: TypedClient) {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function onAuthStateChange(
  supabase: TypedClient,
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange(callback)
}
