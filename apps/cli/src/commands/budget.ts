import type { Command } from 'commander'
import {
  BUDGET_BUCKETS,
  getBucketBudgets,
  isBudgetBucket,
  setBucketBudget,
  todayIso,
  type BucketBudgets,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft } from '../lib/format'
import { parseAmount } from './add'
import { isMonth } from './buckets'

const VALID_ENTITIES = ['personal', 'spa'] as const
type BudgetEntity = (typeof VALID_ENTITIES)[number]

const BUCKET_LABELS: Record<string, string> = {
  necesidades: 'Necesidades',
  consumo: 'Consumo',
  ahorro: 'Ahorro',
}

function parseEntity(raw: string): BudgetEntity {
  const match = VALID_ENTITIES.find((e) => e === raw)
  if (!match) fail(`invalid --entity: ${raw}. One of: ${VALID_ENTITIES.join(', ')}`)
  return match
}

/** Budget amounts accept 0 (unlike transaction amounts) but never negatives. */
export function parseBudgetAmount(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed.startsWith('-')) throw new Error(`invalid amount: ${raw}. Must be zero or positive`)
  if (trimmed === '0') return 0
  return parseAmount(trimmed)
}

export function renderBucketBudgets(data: BucketBudgets, entity: string): string {
  const lines = [`Presupuesto ${data.month} (${entity})`, '']
  lines.push(`  ${'Bucket'.padEnd(14)}${padLeft('Presupuesto', 14)}${padLeft('Gastado', 14)}${padLeft('Queda', 14)}`)
  for (const line of data.buckets) {
    const label = BUCKET_LABELS[line.bucket] ?? line.bucket
    const budget = line.budget === null ? '—' : formatCLP(line.budget)
    const remaining = line.remaining === null ? '—' : formatCLP(line.remaining)
    lines.push(`  ${label.padEnd(14)}${padLeft(budget, 14)}${padLeft(formatCLP(line.spent), 14)}${padLeft(remaining, 14)}`)
  }
  if (data.buckets.some((b) => b.budget === null)) {
    lines.push('')
    lines.push('  — sin presupuesto: `bal budget set <bucket> <monto>`')
  }
  return lines.join('\n') + '\n'
}

interface ShowOptions {
  month?: string
  entity: string
  json?: boolean
}

interface SetOptions {
  month?: string
  entity: string
  json?: boolean
}

export function registerBudgetCommand(program: Command): void {
  const group = program
    .command('budget')
    .enablePositionalOptions()
    .description('Monthly budget per bucket: budget, spent and remaining (get_bucket_budgets)')
    .option('--month <YYYY-MM>', 'calendar month (default: current)')
    .option('--entity <entity>', `one of: ${VALID_ENTITIES.join(', ')}`, 'personal')
    .option('--json', 'output JSON')
    .action(async (opts: ShowOptions) => {
      if (opts.month && !isMonth(opts.month)) fail(`invalid --month: ${opts.month}. Expected YYYY-MM`)
      const entity = parseEntity(opts.entity)
      const client = await getAuthedClient()
      const data = await getBucketBudgets(client, { month: opts.month, entity })
      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n')
        return
      }
      process.stdout.write(renderBucketBudgets(data, entity))
    })

  group
    .command('set <bucket> <amount>')
    .description(`Set the budget of a bucket (${BUDGET_BUCKETS.join(', ')}) from a month on`)
    .option('--month <YYYY-MM>', 'first month it applies to (default: current)')
    .option('--entity <entity>', `one of: ${VALID_ENTITIES.join(', ')}`, 'personal')
    .option('--json', 'output JSON')
    .action(async (bucket: string, amountRaw: string, opts: SetOptions) => {
      if (!isBudgetBucket(bucket)) fail(`invalid bucket: ${bucket}. One of: ${BUDGET_BUCKETS.join(', ')}`)
      if (opts.month && !isMonth(opts.month)) fail(`invalid --month: ${opts.month}. Expected YYYY-MM`)
      let amount: number
      try {
        amount = parseBudgetAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      const entity = parseEntity(opts.entity)
      const month = opts.month ?? todayIso().slice(0, 7)
      const client = await getAuthedClient()
      const row = await setBucketBudget(client, { bucket, amount, month, entity })
      if (opts.json) {
        process.stdout.write(JSON.stringify(row) + '\n')
        return
      }
      const label = BUCKET_LABELS[bucket] ?? bucket
      process.stdout.write(`✓ ${label}: ${formatCLP(row.amount)} desde ${row.month.slice(0, 7)} (${entity})\n`)
    })
}
