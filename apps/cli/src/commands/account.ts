import type { Command } from 'commander'
import { archiveAccount, createAccount, getAccounts, renameAccount, updateAccountBalance } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft, padRight } from '../lib/format'
import { resolveAccountId } from '../lib/resolve'
import { parseAmount } from './add'

const VALID_TYPES = ['asset', 'liability'] as const
const VALID_SUBTYPES = [
  'debit',
  'cash',
  'credit_card',
  'receivable',
  'payable',
  'investment',
  'property',
] as const
const VALID_ENTITIES = ['personal', 'spa'] as const

type AccountType = (typeof VALID_TYPES)[number]
type AccountSubtype = (typeof VALID_SUBTYPES)[number]
type Entity = (typeof VALID_ENTITIES)[number]

function isAccountType(v: string): v is AccountType {
  return (VALID_TYPES as readonly string[]).includes(v)
}
function isAccountSubtype(v: string): v is AccountSubtype {
  return (VALID_SUBTYPES as readonly string[]).includes(v)
}
function isEntity(v: string): v is Entity {
  return (VALID_ENTITIES as readonly string[]).includes(v)
}

interface ListOptions {
  archived?: boolean
  type?: string
  subtype?: string
  json?: boolean
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('List accounts')
    .option('--archived', 'include archived accounts')
    .option('--type <type>', `filter by type: ${VALID_TYPES.join('|')}`)
    .option('--subtype <subtype>', `filter by subtype: ${VALID_SUBTYPES.join('|')}`)
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const client = await getAuthedClient()
      const accounts = await getAccounts(client, { includeArchived: opts.archived })

      let filtered = accounts ?? []
      if (opts.type) {
        filtered = filtered.filter((a) => a.type === (opts.type as AccountType))
      }
      if (opts.subtype) {
        filtered = filtered.filter((a) => a.subtype === (opts.subtype as AccountSubtype))
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(filtered) + '\n')
        return
      }

      if (filtered.length === 0) {
        process.stdout.write('(no accounts)\n')
        return
      }

      const lines: string[] = []
      lines.push(
        `${padRight('NAME', 28)}${padRight('TYPE', 10)}${padRight('SUBTYPE', 14)}${padLeft('BALANCE', 16)}  ON-BUDGET`,
      )
      for (const a of filtered) {
        lines.push(
          padRight(a.name, 28) +
            padRight(a.type, 10) +
            padRight(a.subtype ?? '', 14) +
            padLeft(formatCLP(a.balance ?? 0), 16) +
            '  ' +
            (a.on_budget ? 'yes' : 'no') +
            (a.is_archived ? '  (archived)' : ''),
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface CreateOptions {
  type?: string
  subtype?: string
  balance?: string
  creditLimit?: string
  entity?: string
  currency?: string
  offBudget?: boolean
  json?: boolean
}

function registerCreate(group: Command): void {
  group
    .command('create <name>')
    .description('Create a new account')
    .requiredOption('--type <type>', `one of: ${VALID_TYPES.join('|')}`)
    .requiredOption('--subtype <subtype>', `one of: ${VALID_SUBTYPES.join('|')}`)
    .option('--balance <n>', 'initial balance (integer)', '0')
    .option('--credit-limit <n>', 'credit limit for credit_card (integer)')
    .option('--entity <entity>', `one of: ${VALID_ENTITIES.join('|')}`, 'personal')
    .option('--currency <code>', 'ISO 4217 currency code', 'CLP')
    .option('--off-budget', 'exclude from position/accumulated (default: investment/property are off)')
    .option('--json', 'output JSON')
    .action(async (name: string, opts: CreateOptions) => {
      if (!opts.type || !isAccountType(opts.type)) {
        fail(`invalid --type: ${opts.type}. One of: ${VALID_TYPES.join(', ')}`)
      }
      if (!opts.subtype || !isAccountSubtype(opts.subtype)) {
        fail(`invalid --subtype: ${opts.subtype}. One of: ${VALID_SUBTYPES.join(', ')}`)
      }
      const entity = opts.entity ?? 'personal'
      if (!isEntity(entity)) {
        fail(`invalid --entity: ${entity}. One of: ${VALID_ENTITIES.join(', ')}`)
      }

      let balance = 0
      if (opts.balance && opts.balance !== '0') {
        try {
          balance = parseAmount(opts.balance)
        } catch (err) {
          fail((err as Error).message)
        }
      }

      let creditLimit: number | undefined
      if (opts.creditLimit) {
        try {
          creditLimit = parseAmount(opts.creditLimit)
        } catch (err) {
          fail((err as Error).message)
        }
      }

      const client = await getAuthedClient()
      const result = await createAccount(client, {
        name,
        type: opts.type,
        subtype: opts.subtype,
        entity,
        currency: opts.currency ?? 'CLP',
        balance,
        creditLimit: creditLimit ?? null,
        onBudget: opts.offBudget ? false : undefined,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Created account "${name}" (${opts.type}/${opts.subtype})\n`)
      }
    })
}

interface ArchiveOptions {
  json?: boolean
}

function registerArchive(group: Command): void {
  group
    .command('archive <nameOrId>')
    .description('Archive an account (soft delete)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: ArchiveOptions) => {
      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, ref)
      const result = await archiveAccount(client, accountId)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Archived account ${ref}\n`)
      }
    })
}

interface RenameOptions {
  json?: boolean
}

function registerRename(group: Command): void {
  group
    .command('rename <nameOrId> <newName>')
    .description('Rename an account')
    .option('--json', 'output JSON')
    .action(async (ref: string, newName: string, opts: RenameOptions) => {
      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, ref)
      const result = await renameAccount(client, accountId, newName)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Renamed "${ref}" → "${newName}"\n`)
      }
    })
}

interface BalanceOptions {
  json?: boolean
}

function parseBalanceTarget(raw: string): number {
  const trimmed = raw.trim()
  const sign = trimmed.startsWith('-') ? -1 : 1
  const body = trimmed.replace(/^[-+]/, '')
  let digits: string
  if (/^\d+$/.test(body)) {
    digits = body
  } else if (/^\d{1,3}([.,\s_]\d{3})+$/.test(body)) {
    digits = body.replace(/[.,\s_]/g, '')
  } else {
    throw new Error(`invalid balance: ${raw}`)
  }
  const n = Number.parseInt(digits, 10)
  if (!Number.isFinite(n)) throw new Error(`invalid balance: ${raw}`)
  return sign * n
}

function registerBalance(group: Command): void {
  group
    .command('balance <nameOrId> <newBalance>')
    .description('Manually set an account balance (typically for off-budget: investments, property)')
    .option('--json', 'output JSON')
    .action(async (ref: string, newBalanceRaw: string, opts: BalanceOptions) => {
      let newBalance: number
      try {
        newBalance = parseBalanceTarget(newBalanceRaw)
      } catch (err) {
        fail((err as Error).message)
      }

      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, ref)
      const result = await updateAccountBalance(client, accountId, newBalance)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Updated "${ref}" balance to ${formatCLP(newBalance)}\n`)
      }
    })
}

export function registerAccountCommand(program: Command): void {
  const group = program.command('account').description('Manage accounts')
  registerList(group)
  registerCreate(group)
  registerArchive(group)
  registerRename(group)
  registerBalance(group)
}
