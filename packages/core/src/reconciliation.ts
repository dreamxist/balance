import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function getReconciliationStatus(supabase: TypedClient) {
  const { data, error } = await supabase.rpc('get_reconciliation_status')
  if (error) throw error
  return data as {
    position: number
    accumulated: number
    delta: number
    is_balanced: boolean
    delta_status: 'green' | 'amber' | 'red'
  }
}
