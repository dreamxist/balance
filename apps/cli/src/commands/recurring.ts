import type { Command } from 'commander'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft, padRight } from '../lib/format'
import { isUuid, resolveAccountId } from '../lib/resolve'
import { parseAmount } from './add'

interface RecurringRow {
  id: string
  name: string
  amount: number
  currency: string
  day_of_month: number
  category: string
  account_id: string
  is_active: boolean
}

interface ListOptions {
  includeInactive?: boolean
  json?: boolean
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('List recurring charges (auto-debited by day_of_month)')
    .option('--include-inactive', 'include disabled charges')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const client = await getAuthedClient()
      let query = client.from('recurring_charges').select('*').order('day_of_month')
      if (!opts.includeInactive) query = query.eq('is_active', true)
      const { data, error } = await query
      if (error) throw error
      const rows = (data ?? []) as RecurringRow[]

      if (opts.json) {
        process.stdout.write(JSON.stringify(rows) + '\n')
        return
      }

      if (rows.length === 0) {
        process.stdout.write('(no recurring charges)\n')
        return
      }

      const { data: accData } = await client.from('accounts').select('id, name')
      const accountName = new Map<string, string>()
      for (const a of accData ?? []) accountName.set(a.id, a.name)

      const lines: string[] = []
      lines.push(
        `${padLeft('DAY', 4)}  ${padRight('NAME', 26)}${padLeft('AMOUNT', 14)}  ${padRight('CATEGORY', 26)}${padRight('ACCOUNT', 24)}ACTIVE`,
      )
      for (const r of rows) {
        lines.push(
          padLeft(String(r.day_of_month), 4) +
            '  ' +
            padRight(r.name, 26) +
            padLeft(formatCLP(r.amount), 14) +
            '  ' +
            padRight(r.category, 26) +
            padRight(accountName.get(r.account_id) ?? '(unknown)', 24) +
            (r.is_active ? 'yes' : 'no'),
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface CreateOptions {
  day?: string
  category?: string
  account?: string
  currency?: string
  json?: boolean
}

function registerCreate(group: Command): void {
  group
    .command('create <name> <amount>')
    .description('Create a recurring charge that auto-registers on day_of_month')
    .requiredOption('--day <1-31>', 'day of month to charge')
    .requiredOption('--category <id>', 'category id (e.g. necesidad.suscripciones)')
    .requiredOption('--account <name|id>', 'account to charge')
    .option('--currency <code>', 'ISO 4217 currency code', 'CLP')
    .option('--json', 'output JSON')
    .action(async (name: string, amountRaw: string, opts: CreateOptions) => {
      let amount: number
      try {
        amount = parseAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      const day = Number.parseInt(opts.day ?? '', 10)
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        fail(`invalid --day: ${opts.day}. Must be 1-31.`)
      }
      if (!opts.category) fail('--category is required')
      if (!opts.account) fail('--account is required')

      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, opts.account)

      const { data: userData, error: userErr } = await client.auth.getUser()
      if (userErr || !userData.user) fail('Could not resolve authenticated user')

      const { data, error } = await client
        .from('recurring_charges')
        .insert({
          name,
          amount,
          day_of_month: day,
          category: opts.category,
          account_id: accountId,
          currency: opts.currency ?? 'CLP',
          user_id: userData.user.id,
        })
        .select()
        .single()
      if (error) throw error

      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n')
      } else {
        process.stdout.write(`Created recurring "${name}": ${formatCLP(amount)} on day ${day}\n`)
      }
    })
}

interface DeleteOptions {
  json?: boolean
}

function registerDelete(group: Command): void {
  group
    .command('delete <idOrName>')
    .description('Delete a recurring charge (by uuid or name substring)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: DeleteOptions) => {
      const client = await getAuthedClient()

      let targetId: string
      if (isUuid(ref)) {
        targetId = ref
      } else {
        const { data, error } = await client
          .from('recurring_charges')
          .select('id, name')
          .ilike('name', `%${ref}%`)
        if (error) throw error
        const rows = data ?? []
        if (rows.length === 0) fail(`No recurring charge matches "${ref}"`)
        if (rows.length > 1) {
          const names = rows.map((r) => r.name).join(', ')
          fail(`Ambiguous "${ref}". Matches: ${names}. Use the uuid.`)
        }
        targetId = rows[0]!.id
      }

      const { error } = await client.from('recurring_charges').delete().eq('id', targetId)
      if (error) throw error

      if (opts.json) {
        process.stdout.write(JSON.stringify({ deleted: targetId }) + '\n')
      } else {
        process.stdout.write(`Deleted recurring charge ${targetId}\n`)
      }
    })
}

export function registerRecurringCommand(program: Command): void {
  const group = program.command('recurring').description('Manage recurring charges')
  registerList(group)
  registerCreate(group)
  registerDelete(group)
}
