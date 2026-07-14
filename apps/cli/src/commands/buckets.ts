import type { Command } from 'commander'
import { getMonthlyBuckets, type MonthlyBuckets } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft } from '../lib/format'

const VALID_ENTITIES = ['personal', 'spa'] as const
type BucketsEntity = (typeof VALID_ENTITIES)[number]

function isBucketsEntity(value: string): value is BucketsEntity {
  return (VALID_ENTITIES as readonly string[]).includes(value)
}

export function isMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number.parseInt(value.slice(5, 7), 10)
  return month >= 1 && month <= 12
}

export function renderBuckets(buckets: MonthlyBuckets, entity: string): string {
  const rows: Array<[string, number]> = [
    ['Ingresos', buckets.income],
    ['Necesidades', buckets.necesidades],
    ['Consumo', buckets.consumo],
    ['Ahorro', buckets.ahorro],
    ['Por categorizar', buckets.por_categorizar],
  ]
  const lines = [`Buckets ${buckets.month} (${entity})`, '']
  for (const [label, amount] of rows) {
    lines.push(`  ${label.padEnd(16)}${padLeft(formatCLP(amount), 14)}`)
  }
  lines.push(`  ${'─'.repeat(30)}`)
  lines.push(`  ${'Disponible'.padEnd(16)}${padLeft(formatCLP(buckets.disponible), 14)}`)
  return lines.join('\n') + '\n'
}

interface BucketsOptions {
  month?: string
  entity: string
  json?: boolean
}

export function registerBucketsCommand(program: Command): void {
  program
    .command('buckets')
    .description('Monthly buckets (canonical numbers from get_monthly_buckets)')
    .option('--month <YYYY-MM>', 'calendar month (default: current)')
    .option('--entity <entity>', `one of: ${VALID_ENTITIES.join(', ')}`, 'personal')
    .option('--json', 'output JSON')
    .action(async (opts: BucketsOptions) => {
      if (opts.month && !isMonth(opts.month)) {
        fail(`invalid --month: ${opts.month}. Expected YYYY-MM`)
      }
      if (!isBucketsEntity(opts.entity)) {
        fail(`invalid --entity: ${opts.entity}. One of: ${VALID_ENTITIES.join(', ')}`)
      }

      const client = await getAuthedClient()
      const buckets = await getMonthlyBuckets(client, {
        month: opts.month,
        entity: opts.entity,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(buckets) + '\n')
        return
      }
      process.stdout.write(renderBuckets(buckets, opts.entity))
    })
}
