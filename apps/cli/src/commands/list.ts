import type { Command } from 'commander'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft, padRight } from '../lib/format'
import { isIsoDate, isPeriod, periodRange, VALID_PERIODS } from '../lib/period'
import { resolveAccountId } from '../lib/resolve'

const VALID_TX_TYPES = ['income', 'expense', 'refund', 'transfer', 'debt_payment', 'adjustment'] as const
type TxTypeFilter = (typeof VALID_TX_TYPES)[number]

function isTxTypeFilter(value: string): value is TxTypeFilter {
  return (VALID_TX_TYPES as readonly string[]).includes(value)
}

export function parseTypeList(raw: string): TxTypeFilter[] {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error(`invalid --type: ${raw}`)
  const invalid = parts.filter((p) => !isTxTypeFilter(p))
  if (invalid.length > 0) {
    throw new Error(`invalid --type values: ${invalid.join(', ')}. One of: ${VALID_TX_TYPES.join(', ')}`)
  }
  return parts as TxTypeFilter[]
}

export function formatSignedAmount(type: string, amount: number): string {
  const abs = Math.abs(amount)
  let sign: string
  if (type === 'expense' || type === 'debt_payment') {
    sign = '-'
  } else if (type === 'income' || type === 'refund') {
    sign = '+'
  } else {
    sign = amount < 0 ? '-' : '+'
  }
  return `${sign}${formatCLP(abs)}`
}

const VALID_ENTITIES = ['personal', 'spa', 'all'] as const
type EntityFilter = (typeof VALID_ENTITIES)[number]

function isEntityFilter(value: string): value is EntityFilter {
  return (VALID_ENTITIES as readonly string[]).includes(value)
}

interface ListOptions {
  period: string
  category?: string
  account?: string
  type?: string
  search?: string
  entity: string
  dateFrom?: string
  dateTo?: string
  limit: string
  json?: boolean
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List recent transactions')
    .option('--period <period>', `one of: ${VALID_PERIODS.join(', ')}`, 'week')
    .option('--category <text>', 'filter by category prefix')
    .option('--account <name|id>', 'filter by account')
    .option('--type <types>', `comma-separated, any of: ${VALID_TX_TYPES.join(', ')}`)
    .option('--search <text>', 'filter by description (case-insensitive contains)')
    .option('--entity <entity>', `one of: ${VALID_ENTITIES.join(', ')}`, 'all')
    .option('--date-from <YYYY-MM-DD>', 'custom start date (overrides --period)')
    .option('--date-to <YYYY-MM-DD>', 'custom end date inclusive (overrides --period)')
    .option('--limit <n>', 'max rows', '100')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const usingCustomRange = Boolean(opts.dateFrom || opts.dateTo)
      if (!usingCustomRange && !isPeriod(opts.period)) {
        fail(`invalid --period: ${opts.period}. One of: ${VALID_PERIODS.join(', ')}`)
      }
      if (opts.dateFrom && !isIsoDate(opts.dateFrom)) {
        fail(`invalid --date-from: ${opts.dateFrom}. Expected YYYY-MM-DD`)
      }
      if (opts.dateTo && !isIsoDate(opts.dateTo)) {
        fail(`invalid --date-to: ${opts.dateTo}. Expected YYYY-MM-DD`)
      }

      let types: TxTypeFilter[] | undefined
      if (opts.type) {
        try {
          types = parseTypeList(opts.type)
        } catch (err) {
          fail((err as Error).message)
        }
      }

      if (!isEntityFilter(opts.entity)) {
        fail(`invalid --entity: ${opts.entity}. One of: ${VALID_ENTITIES.join(', ')}`)
      }

      const limit = Number.parseInt(opts.limit, 10)
      if (!Number.isFinite(limit) || limit <= 0) fail(`invalid --limit: ${opts.limit}`)

      const client = await getAuthedClient()
      const accountId = opts.account ? await resolveAccountId(client, opts.account) : undefined

      let start: string
      let endExclusive: string
      if (usingCustomRange) {
        start = opts.dateFrom ?? '1970-01-01'
        if (opts.dateTo) {
          const d = new Date(opts.dateTo)
          d.setDate(d.getDate() + 1)
          endExclusive = d.toISOString().slice(0, 10)
        } else {
          const d = new Date()
          d.setDate(d.getDate() + 1)
          endExclusive = d.toISOString().slice(0, 10)
        }
      } else {
        const range = periodRange(opts.period as Parameters<typeof periodRange>[0])
        start = range.start
        endExclusive = range.endExclusive
      }

      let query = client
        .from('transactions')
        .select('*')
        .gte('date', start)
        .lt('date', endExclusive)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (accountId) query = query.eq('account_id', accountId)
      if (opts.category) query = query.ilike('category', `${opts.category}%`)
      if (types && types.length > 0) query = query.in('type', types)
      if (opts.search) query = query.ilike('description', `%${opts.search}%`)
      if (opts.entity !== 'all') query = query.eq('entity', opts.entity)

      const { data, error } = await query
      if (error) throw error
      const rows = data ?? []

      if (opts.json) {
        process.stdout.write(JSON.stringify(rows) + '\n')
        return
      }

      if (rows.length === 0) {
        process.stdout.write('(sin movimientos en el período)\n')
        return
      }

      const lines: string[] = []
      let currentDate = ''
      for (const tx of rows) {
        if (tx.date !== currentDate) {
          lines.push('')
          lines.push(tx.date)
          currentDate = tx.date
        }
        const amount = padLeft(formatSignedAmount(tx.type, tx.amount), 16)
        const category = padRight(tx.category ?? '', 22)
        const description = tx.description ?? ''
        lines.push(`  ${amount}  ${category} ${description}`)
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}
