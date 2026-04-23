import { homedir } from 'node:os'
import { join } from 'node:path'

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!url) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) env var')
  return url
}

export function getSupabaseAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!key) throw new Error('Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) env var')
  return key
}

export function getSessionPath(): string {
  const custom = process.env.BAL_SESSION_FILE
  if (custom) return custom
  return join(homedir(), '.balance', 'session.json')
}
