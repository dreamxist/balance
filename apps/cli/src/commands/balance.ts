import type { Command } from 'commander'
import { getAccounts, getReconciliationStatus, getSpaDashboard } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP } from '../lib/format'
import { blank, chip, divider, headerLine, indent, pad, ui } from '../lib/ui'

const VALID_ENTITIES = ['personal', 'spa', 'all'] as const
type EntityFilter = (typeof VALID_ENTITIES)[number]

function isEntityFilter(value: string): value is EntityFilter {
  return (VALID_ENTITIES as readonly string[]).includes(value)
}

interface BalanceOptions {
  entity: string
  json?: boolean
}

export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Show reconciliation status (position vs accumulated, delta)')
    .option('--entity <entity>', `one of: ${VALID_ENTITIES.join(', ')}`, 'personal')
    .option('--json', 'output JSON')
    .action(async (opts: BalanceOptions) => {
      if (!isEntityFilter(opts.entity)) {
        fail(`invalid --entity: ${opts.entity}. One of: ${VALID_ENTITIES.join(', ')}`)
      }
      const client = await getAuthedClient()

      if (opts.entity === 'spa') {
        await renderSpa(client, opts.json === true)
        return
      }

      // personal | all
      const scope = opts.entity === 'all' ? undefined : 'personal'
      const [rec, accounts] = await Promise.all([
        getReconciliationStatus(client, scope),
        getAccounts(client, scope ? { entity: scope } : undefined),
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
      lines.push(headerLine(ui.title(`RECONCILIATION · ${opts.entity}`), ui.dim(today)))
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

async function renderSpa(
  client: Awaited<ReturnType<typeof getAuthedClient>>,
  json: boolean,
): Promise<void> {
  const dash = await getSpaDashboard(client)
  const total = dash.accounts.reduce((sum, a) => sum + a.balance, 0)

  if (json) {
    process.stdout.write(JSON.stringify({ ...dash, total }) + '\n')
    return
  }

  const lines: string[] = []
  const today = new Date().toISOString().slice(0, 10)
  const labelW = 18
  const amountW = 16
  const row = (label: string, value: string): string =>
    indent(`${ui.dim(pad(label, labelW))}${pad(value, amountW, 'left')}`)

  lines.push(blank())
  lines.push(headerLine(ui.title('SPA · caja'), ui.dim(today)))
  lines.push(blank())
  const nameW = Math.max(...dash.accounts.map((a) => a.name.length), 18)
  for (const a of dash.accounts) {
    const color = a.balance < 0 ? ui.negative : ui.strong
    lines.push(indent(`${pad(a.name, nameW)}  ${pad(color(formatCLP(a.balance)), amountW, 'left')}`))
  }
  lines.push(divider(nameW + amountW))
  lines.push(indent(`${pad(ui.strong('Total SpA'), nameW)}  ${pad(ui.strong(formatCLP(total)), amountW, 'left')}`))
  lines.push(blank())
  lines.push(headerLine(ui.title('MES ACTUAL'), ui.dim('estimación')))
  lines.push(blank())
  lines.push(row('Ingresos', formatCLP(dash.monthlyIncome)))
  lines.push(row('Gastos', formatCLP(dash.monthlyExpenses)))
  lines.push(row('IVA neto mes', `${formatCLP(dash.ivaDue)} ${ui.dim('(débito − crédito; detalle en bal spa f29)')}`))
  lines.push(blank())

  process.stdout.write(lines.join('\n') + '\n')
}
