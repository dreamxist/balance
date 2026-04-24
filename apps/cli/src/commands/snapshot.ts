import type { Command } from 'commander'
import { createSnapshot, getSnapshotHistory } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft, padRight } from '../lib/format'
import { isIsoDate } from '../lib/period'

interface CreateOptions {
  date?: string
  json?: boolean
}

function registerCreate(group: Command): void {
  group
    .command('create')
    .description('Capture a snapshot of current position (net worth, accumulated, delta)')
    .option('--date <YYYY-MM-DD>', 'snapshot date (default today)')
    .option('--json', 'output JSON')
    .action(async (opts: CreateOptions) => {
      if (opts.date && !isIsoDate(opts.date)) {
        fail(`invalid --date: ${opts.date}. Expected YYYY-MM-DD`)
      }
      const client = await getAuthedClient()
      const result = await createSnapshot(client, opts.date)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Snapshot created for ${opts.date ?? 'today'}\n`)
      }
    })
}

interface SnapshotRow {
  id: string
  date: string
  net_worth: number
  position: number
  accumulated: number
  delta: number
}

interface ListOptions {
  limit: string
  json?: boolean
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('Show snapshot history')
    .option('--limit <n>', 'max rows', '20')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const limit = Number.parseInt(opts.limit, 10)
      if (!Number.isFinite(limit) || limit <= 0) fail(`invalid --limit: ${opts.limit}`)

      const client = await getAuthedClient()
      const rows = ((await getSnapshotHistory(client, limit)) ?? []) as SnapshotRow[]

      if (opts.json) {
        process.stdout.write(JSON.stringify(rows) + '\n')
        return
      }

      if (rows.length === 0) {
        process.stdout.write('(no snapshots)\n')
        return
      }

      const lines: string[] = []
      lines.push(
        `${padRight('DATE', 12)}${padLeft('NET WORTH', 16)}${padLeft('POSITION', 16)}${padLeft('DELTA', 12)}`,
      )
      for (const s of rows) {
        lines.push(
          padRight(s.date, 12) +
            padLeft(formatCLP(s.net_worth), 16) +
            padLeft(formatCLP(s.position), 16) +
            padLeft(formatCLP(s.delta), 12),
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

export function registerSnapshotCommand(program: Command): void {
  const group = program.command('snapshot').description('Manage patrimony snapshots')
  registerCreate(group)
  registerList(group)
}
