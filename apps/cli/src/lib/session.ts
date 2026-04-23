import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getSessionPath } from './config'

export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await readFile(getSessionPath(), 'utf8')
    return JSON.parse(raw) as Session
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function saveSession(session: Session): Promise<void> {
  const path = getSessionPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify(session, null, 2), { mode: 0o600 })
  await chmod(path, 0o600)
}

export function isExpired(session: Session, skewMs = 30_000): boolean {
  return Date.now() >= session.expires_at - skewMs
}
