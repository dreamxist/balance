import type { Command } from 'commander'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP } from '../lib/format'
import { isPeriod, periodRange, VALID_PERIODS } from '../lib/period'
import { resolveAccountId } from '../lib/resolve'
import { blank, headerLine, indent, pad, ui } from '../lib/ui'

const VALID_TX_TYPES = ['income', 'expense', 'refund', 'transfer', 'debt_payment', 'adjustment'] as const
type TxTypeFilter = (typeof VALID_TX_TYPES)[number]

function isTxTypeFilter(value: string): value is TxTypeFilter {
  return (VALID_TX_TYPES as readonly string[]).includes(value)
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

function colorForType(type: string): (s: string) => string {
  if (type === 'expense' || type === 'debt_payment') return ui.negative
  if (type === 'income' || type === 'refund') return ui.positive
  return ui.muted
}

interface ListOptions {
  period: string
  category?: string
  account?: string
  type?: string
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
    .option('--type <type>', `one of: ${VALID_TX_TYPES.join(', ')}`)
    .option('--limit <n>', 'max rows', '100')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      if (!isPeriod(opts.period)) {
        fail(`invalid --period: ${opts.period}. One of: ${VALID_PERIODS.join(', ')}`)
      }
      if (opts.type && !isTxTypeFilter(opts.type)) {
        fail(`invalid --type: ${opts.type}. One of: ${VALID_TX_TYPES.join(', ')}`)
      }
      const limit = Number.parseInt(opts.limit, 10)
      if (!Number.isFinite(limit) || limit <= 0) fail(`invalid --limit: ${opts.limit}`)

      const client = await getAuthedClient()
      const accountId = opts.account ? await resolveAccountId(client, opts.account) : undefined
      const range = periodRange(opts.period)

      let query = client
        .from('transactions')
        .select('*')
        .gte('date', range.start)
        .lt('date', range.endExclusive)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (accountId) query = query.eq('account_id', accountId)
      if (opts.category) query = query.ilike('category', `${opts.category}%`)
      if (opts.type && isTxTypeFilter(opts.type)) query = query.eq('type', opts.type)

      const { data, error } = await query
      if (error) throw error
      const rows = data ?? []

      if (opts.json) {
        process.stdout.write(JSON.stringify(rows) + '\n')
        return
      }

      const lines: string[] = []
      const meta = `${opts.period} · ${rows.length} result${rows.length === 1 ? '' : 's'}`
      lines.push(blank())
      lines.push(headerLine(ui.title('TRANSACTIONS'), ui.dim(meta)))
      lines.push(blank())

      if (rows.length === 0) {
        lines.push(indent(ui.dim('(sin movimientos en el período)')))
        lines.push(blank())
        process.stdout.write(lines.join('\n') + '\n')
        return
      }

      let currentDate = ''
      for (const tx of rows) {
        if (tx.date !== currentDate) {
          if (currentDate !== '') lines.push(blank())
          lines.push(indent(ui.strong(tx.date)))
          currentDate = tx.date
        }
        const color = colorForType(tx.type)
        const amount = pad(color(formatSignedAmount(tx.type, tx.amount)), 16, 'left')
        const category = pad(ui.accent(tx.category ?? ''), 22)
        const description = ui.dim(tx.description ?? '')
        lines.push(`${indent('')}  ${amount}  ${category} ${description}`)
      }
      lines.push(blank())

      process.stdout.write(lines.join('\n') + '\n')
    })
}
