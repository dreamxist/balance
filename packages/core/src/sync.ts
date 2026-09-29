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
  if (error) throw new Error(await functionErrorMessage(error))
  return data as GmailSyncSummary
}

export interface FintocSyncSummary {
  configured: boolean
  mode?: string
  link_status?: string
  last_refreshed?: string | null
  since?: string
  fetched?: number
  staged?: number
  ignored?: number
  staged_errors?: number
  promoted?: number
  pending?: number
  errors?: number
  skipped_existing?: number
  failures?: string[]
}

/** Error body of a non-2xx edge function response, when it carries one. */
async function functionErrorMessage(error: Error & { context?: unknown }): Promise<string> {
  const context = error.context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown }
      if (typeof body.error === 'string') return body.error
    } catch {
      // not JSON (e.g. plain "Forbidden") — fall back to the text
    }
    try {
      const text = await context.text()
      if (text) return text
    } catch {
      // body already consumed
    }
  }
  return error.message
}

/**
 * Trigger the fintoc-sync edge function with the caller's JWT. Resolves with
 * configured=false when the deployment has no Fintoc secrets.
 */
export async function triggerFintocSync(supabase: TypedClient): Promise<FintocSyncSummary> {
  const { data, error } = await supabase.functions.invoke('fintoc-sync', { body: {} })
  if (error) throw new Error(await functionErrorMessage(error))
  return data as FintocSyncSummary
}
