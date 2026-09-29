// Records the outcome of a sync run in sync_state (see migration
// 20260929130000_sync_health). A success clears the last error; a failure
// keeps the last success so `bal balance` can say how long a source has been
// down. Never throws: health bookkeeping must not turn into a second failure.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type SyncSource = 'gmail' | 'fintoc'

export async function recordSyncOutcome(
  supabase: SupabaseClient,
  userId: string,
  source: SyncSource,
  error: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  const fields = error === null
    ? { [`${source}_last_success_at`]: now, [`${source}_last_error`]: null, [`${source}_last_error_at`]: null }
    : { [`${source}_last_error`]: error.slice(0, 500), [`${source}_last_error_at`]: now }
  const { error: dbError } = await supabase
    .from('sync_state')
    .upsert({ user_id: userId, updated_at: now, ...fields })
  if (dbError) console.error(`${source}-sync: could not record sync health: ${dbError.message}`)
}
