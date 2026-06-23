import type { SupabaseClient as UntypedClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export interface ReconciliationStatus {
  position: number
  accumulated: number
  delta: number
  is_balanced: boolean
  delta_status: 'green' | 'amber' | 'red'
  entity: 'personal' | 'spa' | null
}

export async function getReconciliationStatus(
  supabase: TypedClient,
  entity?: 'personal' | 'spa',
): Promise<ReconciliationStatus> {
  // p_entity was added in migration 00031; generated types still type Args as
  // `never`, so call through an untyped client until types are regenerated.
  const client = supabase as unknown as UntypedClient
  const { data, error } = await client.rpc(
    'get_reconciliation_status',
    entity ? { p_entity: entity } : {},
  )
  if (error) throw error
  return data as ReconciliationStatus
}
