import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (input: { email: string; password: string }) => Promise<void>
  signUp: (input: { email: string; password: string }) => Promise<{ confirmEmail: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (!error && data.session) {
        setSession(data.session)
        setUser(data.session.user)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, s: Session | null) => {
        setSession(s)
        setUser(s?.user ?? null)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    if (error) throw error
    setSession(data.session)
    setUser(data.user)
  }, [])

  const signUp = useCallback(async (input: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
    })
    if (error) throw error
    const confirmEmail = !data.session
    if (data.session) {
      setSession(data.session)
      setUser(data.user)
    }
    return { confirmEmail }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setSession(null)
    setUser(null)
  }, [])

  return (
    <AuthContext value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
