import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export interface GmailSyncSummary {
  mode: string
  since: string
  fetched: number
  parsed: number
  ignored: number
  staged_errors: number
  usd_rate: number | null
  promoted: number
  pending: number
  errors: number
  skipped_existing: number
  failures: string[]
}

/** Trigger the gmail-sync edge function with the caller's JWT. */
export async function triggerGmailSync(
  supabase: TypedClient,
  options: { since?: string } = {},
): Promise<GmailSyncSummary> {
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: options.since ? { since: options.since } : {},
  })
  if (error) throw error
  return data as GmailSyncSummary
}
