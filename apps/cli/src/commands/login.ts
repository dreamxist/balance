import type { Command } from 'commander'
import { getSupabaseUrl } from '../lib/config'
import { fail } from '../lib/exit'
import { saveSession, type Session } from '../lib/session'
import { ui } from '../lib/ui'

interface LoginOptions {
  apiKey?: string
  json?: boolean
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with an API key and persist a session')
    .option('--api-key <key>', 'API key (bal_...). Falls back to BAL_API_KEY env var.')
    .option('--json', 'Output JSON')
    .action(async (opts: LoginOptions) => {
      const apiKey = opts.apiKey ?? process.env.BAL_API_KEY
      if (!apiKey) fail('Missing --api-key or BAL_API_KEY env var')

      const url = `${getSupabaseUrl()}/functions/v1/auth-apikey`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
      })

      if (!res.ok) {
        const body = await res.text()
        fail(`login failed (${res.status}): ${body}`)
      }

      const session = (await res.json()) as Session
      if (!session.access_token || !session.refresh_token || !session.expires_at) {
        fail('login response missing expected fields')
      }
      await saveSession(session)

      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: true, expires_at: session.expires_at }) + '\n')
      } else {
        const expires = new Date(session.expires_at).toISOString()
        const tick = ui.positive('✓')
        process.stdout.write(`  ${tick} ${ui.dim('logged in · session expires')} ${ui.strong(expires)}\n`)
      }
    })
}
