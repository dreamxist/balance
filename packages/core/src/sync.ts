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

export type SyncSourceName = 'gmail' | 'fintoc'

export interface SyncHealthIssue {
  source: SyncSourceName
  /** Last successful run, or null when it never succeeded. */
  lastSuccessAt: string | null
  /** Error of the latest failed run when it is newer than the last success. */
  error: string | null
  hoursSinceSuccess: number | null
}

export interface SyncHealthInput {
  gmail_last_success_at: string | null
  gmail_last_error: string | null
  gmail_last_error_at: string | null
  fintoc_last_success_at: string | null
  fintoc_last_error: string | null
  fintoc_last_error_at: string | null
}

/** Crons run every 12 h; a source is stale after missing ~3 runs. */
export const SYNC_STALE_HOURS = 36

/**
 * Sources that need attention: the latest run failed, or the last success is
 * older than SYNC_STALE_HOURS. A source with no recorded run at all is not
 * configured and is skipped.
 */
export function evaluateSyncHealth(
  state: SyncHealthInput | null,
  now: Date = new Date(),
): SyncHealthIssue[] {
  if (!state) return []
  const issues: SyncHealthIssue[] = []
  const sources: SyncSourceName[] = ['gmail', 'fintoc']
  for (const source of sources) {
    const lastSuccessAt = state[`${source}_last_success_at`]
    const lastError = state[`${source}_last_error`]
    const lastErrorAt = state[`${source}_last_error_at`]
    if (!lastSuccessAt && !lastErrorAt) continue

    const successMs = lastSuccessAt ? Date.parse(lastSuccessAt) : null
    const errorMs = lastErrorAt ? Date.parse(lastErrorAt) : null
    const failing = errorMs !== null && (successMs === null || errorMs > successMs)
    const hoursSinceSuccess = successMs === null ? null : (now.getTime() - successMs) / 3_600_000
    const stale = hoursSinceSuccess === null || hoursSinceSuccess > SYNC_STALE_HOURS
    if (!failing && !stale) continue

    issues.push({
      source,
      lastSuccessAt,
      error: failing ? lastError : null,
      hoursSinceSuccess: hoursSinceSuccess === null ? null : Math.floor(hoursSinceSuccess),
    })
  }
  return issues
}
