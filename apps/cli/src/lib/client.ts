import { createSupabaseClient, type SupabaseClient, type Database } from '@balance/core'
import { isExpired, loadSession, saveSession, type Session } from './session'

export async function getAuthedClient(): Promise<SupabaseClient<Database>> {
  const session = await loadSession()
  if (!session) {
    throw new Error('No session. Run `bal login --api-key <key>` first.')
  }
  const current = isExpired(session) ? await refreshSession(session) : session
  return createSupabaseClient({ accessToken: current.access_token })
}

async function refreshSession(session: Session): Promise<Session> {
  const bare = createSupabaseClient()
  const { data, error } = await bare.auth.refreshSession({
    refresh_token: session.refresh_token,
  })
  if (error || !data.session) {
    throw new Error('Session expired. Run `bal login --api-key <key>` again.')
  }
  const next: Session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: (data.session.expires_at ?? 0) * 1000,
  }
  await saveSession(next)
  return next
}
