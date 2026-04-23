import type { Command } from 'commander'
import { getAccounts, getReconciliationStatus } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { formatCLP } from '../lib/format'
import { blank, chip, divider, headerLine, indent, pad, ui } from '../lib/ui'

interface BalanceOptions {
  json?: boolean
}

export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Show reconciliation status (position vs accumulated, delta)')
    .option('--json', 'output JSON')
    .action(async (opts: BalanceOptions) => {
      const client = await getAuthedClient()
      const [rec, accounts] = await Promise.all([
        getReconciliationStatus(client),
        getAccounts(client),
      ])

      if (opts.json) {
        process.stdout.write(JSON.stringify({ reconciliation: rec, accounts }) + '\n')
        return
      }

      const lines: string[] = []
      const today = new Date().toISOString().slice(0, 10)

      const labelW = 14
      const amountW = 16
      const row = (label: string, value: string, trailing = ''): string => {
        const pair = `${ui.dim(pad(label, labelW))}${pad(value, amountW, 'left')}`
        return indent(trailing ? `${pair}  ${trailing}` : pair)
      }

      lines.push(blank())
      lines.push(headerLine(ui.title('RECONCILIATION'), ui.dim(today)))
      lines.push(blank())
      lines.push(row('Position', formatCLP(rec.position)))
      lines.push(row('Accumulated', formatCLP(rec.accumulated)))
      lines.push(divider(labelW + amountW))
      const deltaColor = rec.delta === 0 ? ui.positive : ui.negative
      const deltaChip = rec.is_balanced
        ? chip('balanced', 'positive')
        : chip(rec.delta_status, 'negative')
      lines.push(row('Delta', deltaColor(formatCLP(rec.delta)), deltaChip))
      lines.push(blank())

      lines.push(headerLine(ui.title('ACCOUNTS'), ui.dim(`${accounts.length} total`)))
      lines.push(blank())
      const nameW = Math.max(...accounts.map((a) => a.name.length), 20)
      for (const a of accounts) {
        const amount = formatCLP(a.balance)
        const color = a.balance < 0 ? ui.negative : ui.strong
        const line = `${pad(a.name, nameW)}  ${pad(color(amount), amountW, 'left')}`
        lines.push(indent(line))
      }
      lines.push(blank())

      process.stdout.write(lines.join('\n') + '\n')
    })
}
