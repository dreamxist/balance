import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function createSnapshot(supabase: TypedClient, date?: string) {
  const { data, error } = await supabase.rpc('create_snapshot', {
    p_date: date ?? undefined,
  })
  if (error) throw error
  return data
}

export async function getSnapshotHistory(supabase: TypedClient, limit?: number) {
  const { data, error } = await supabase.rpc('get_snapshot_history', {
    p_limit: limit ?? undefined,
  })
  if (error) throw error
  return data
}
