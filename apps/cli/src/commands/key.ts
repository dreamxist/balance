import type { Command } from 'commander'
import { createSupabaseClient, generateApiKey, hashApiKey, signIn } from '@balance/core'
import { fail } from '../lib/exit'
import { padRight } from '../lib/format'

export function extractKeyPrefix(key: string): string {
  return key.slice(0, 12)
}

interface CreateOptions {
  email?: string
  password?: string
  name: string
  json?: boolean
}

async function authed(email: string, password: string) {
  const client = createSupabaseClient()
  await signIn(client, { email, password })
  return client
}

function registerCreate(group: Command): void {
  group
    .command('create')
    .description('Generate a new API key (prints the key in plaintext once)')
    .requiredOption('--name <name>', 'human-readable label for this key')
    .option('--email <email>', 'Balance account email. Falls back to BAL_EMAIL env.')
    .option('--password <password>', 'Account password. Falls back to BAL_PASSWORD env (prefer env to avoid shell history).')
    .option('--json', 'output JSON')
    .action(async (opts: CreateOptions) => {
      const email = opts.email ?? process.env.BAL_EMAIL
      const password = opts.password ?? process.env.BAL_PASSWORD
      if (!email) fail('Missing --email or BAL_EMAIL env var')
      if (!password) fail('Missing --password or BAL_PASSWORD env var')

      const client = await authed(email, password)
      const { data: userData, error: userErr } = await client.auth.getUser()
      if (userErr || !userData.user) fail('Could not resolve authenticated user')

      const apiKey = generateApiKey()
      const keyHash = await hashApiKey(apiKey)
      const keyPrefix = extractKeyPrefix(apiKey)

      const { data, error } = await client
        .from('api_keys')
        .insert({
          user_id: userData.user.id,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          name: opts.name,
        })
        .select('id, key_prefix, name, created_at')
        .single()
      if (error) throw error

      if (opts.json) {
        process.stdout.write(JSON.stringify({ api_key: apiKey, record: data }) + '\n')
      } else {
        process.stdout.write(
          [
            'API key created. Save it now — it will NOT be shown again:',
            '',
            `  ${apiKey}`,
            '',
            `Prefix: ${data.key_prefix}`,
            `Name:   ${data.name}`,
            `ID:     ${data.id}`,
            '',
            'Use it with: bal login --api-key <key>   (or BAL_API_KEY env var)',
          ].join('\n') + '\n',
        )
      }
    })
}

interface ListOptions {
  includeRevoked?: boolean
  json?: boolean
  email?: string
  password?: string
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('List API keys for the current account (never shows plaintext)')
    .option('--include-revoked', 'include keys with is_active=false')
    .option('--email <email>')
    .option('--password <password>')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const email = opts.email ?? process.env.BAL_EMAIL
      const password = opts.password ?? process.env.BAL_PASSWORD
      if (!email) fail('Missing --email or BAL_EMAIL env var')
      if (!password) fail('Missing --password or BAL_PASSWORD env var')

      const client = await authed(email, password)
      let query = client
        .from('api_keys')
        .select('id, key_prefix, name, created_at, last_used_at, is_active')
        .order('created_at', { ascending: false })
      if (!opts.includeRevoked) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) throw error

      if (opts.json) {
        process.stdout.write(JSON.stringify(data ?? []) + '\n')
        return
      }

      if (!data || data.length === 0) {
        process.stdout.write('(no API keys)\n')
        return
      }

      const lines: string[] = []
      lines.push(
        `${padRight('PREFIX', 14)}${padRight('NAME', 24)}${padRight('CREATED', 12)}${padRight('LAST USED', 12)}ACTIVE`,
      )
      for (const k of data) {
        lines.push(
          padRight(k.key_prefix, 14) +
            padRight(k.name, 24) +
            padRight((k.created_at ?? '').slice(0, 10), 12) +
            padRight((k.last_used_at ?? '—').slice(0, 10), 12) +
            (k.is_active ? 'yes' : 'no'),
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface RevokeOptions {
  email?: string
  password?: string
  json?: boolean
}

function registerRevoke(group: Command): void {
  group
    .command('revoke <idOrPrefix>')
    .description('Revoke an API key by id (uuid) or prefix match')
    .option('--email <email>')
    .option('--password <password>')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: RevokeOptions) => {
      const email = opts.email ?? process.env.BAL_EMAIL
      const password = opts.password ?? process.env.BAL_PASSWORD
      if (!email) fail('Missing --email or BAL_EMAIL env var')
      if (!password) fail('Missing --password or BAL_PASSWORD env var')

      const client = await authed(email, password)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      let query = client.from('api_keys').update({ is_active: false })
      if (UUID_RE.test(ref)) {
        query = query.eq('id', ref)
      } else {
        query = query.eq('key_prefix', ref)
      }

      const { data, error } = await query.select('id, key_prefix, name, is_active')
      if (error) throw error
      const rows = data ?? []

      if (rows.length === 0) fail(`No key matches "${ref}"`)
      if (rows.length > 1) {
        fail(`Ambiguous reference "${ref}" matches ${rows.length} keys. Use the uuid.`)
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(rows[0]) + '\n')
      } else {
        const row = rows[0]!
        process.stdout.write(`Revoked ${row.key_prefix} (${row.name})\n`)
      }
    })
}

export function registerKeyCommand(program: Command): void {
  const group = program.command('key').description('Manage API keys')
  registerCreate(group)
  registerList(group)
  registerRevoke(group)
}
