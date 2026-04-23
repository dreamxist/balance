import { renderBanner } from '../src/commands/banner'
import { formatCLP } from '../src/lib/format'
import { blank, chip, divider, headerLine, indent, pad, ui } from '../src/lib/ui'
import { formatSignedAmount } from '../src/commands/list'

function colorForType(type: string): (s: string) => string {
  if (type === 'expense' || type === 'debt_payment') return ui.negative
  if (type === 'income' || type === 'refund') return ui.positive
  return ui.muted
}

async function main(): Promise<void> {
  process.stdout.write('\n=== bal ===\n')
  process.stdout.write(await renderBanner())

  const rec = { position: 1_000_000, accumulated: 1_000_000, delta: 0, is_balanced: true, delta_status: 'balanced' }
  const accounts = [
    { name: 'Checking Demo', balance: 400_000 },
    { name: 'Savings Demo', balance: 300_000 },
    { name: 'Wallet Demo', balance: 100_000 },
    { name: 'Broker Demo', balance: 200_000 },
  ]

  process.stdout.write('\n=== bal balance ===\n\n')
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
  const deltaChip = rec.is_balanced ? chip('balanced', 'positive') : chip(rec.delta_status, 'negative')
  lines.push(row('Delta', deltaColor(formatCLP(rec.delta)), deltaChip))
  lines.push(blank())
  lines.push(headerLine(ui.title('ACCOUNTS'), ui.dim(`${accounts.length} total`)))
  lines.push(blank())
  const nameW = Math.max(...accounts.map((a) => a.name.length), 20)
  for (const a of accounts) {
    const amount = formatCLP(a.balance)
    const color = a.balance < 0 ? ui.negative : ui.strong
    lines.push(indent(`${pad(a.name, nameW)}  ${pad(color(amount), amountW, 'left')}`))
  }
  lines.push(blank())
  process.stdout.write(lines.join('\n') + '\n')

  process.stdout.write('=== bal list --period month ===\n\n')
  const rows = [
    { date: '2026-04-22', type: 'expense', amount: 10_000, category: 'supermercado', description: 'Demo Market' },
    { date: '2026-04-22', type: 'expense', amount: 5_000, category: 'transporte', description: 'Demo Ride' },
    { date: '2026-04-21', type: 'income', amount: 2_000_000, category: 'sueldo', description: 'Demo Corp' },
    { date: '2026-04-21', type: 'expense', amount: 30_000, category: 'restaurantes', description: 'Demo Resto' },
    { date: '2026-04-20', type: 'debt_payment', amount: 100_000, category: 'deuda', description: 'Cuota demo 1/12' },
    { date: '2026-04-19', type: 'refund', amount: 15_000, category: 'devoluciones', description: 'Demo Shop' },
  ]
  const list: string[] = []
  list.push(blank())
  list.push(headerLine(ui.title('TRANSACTIONS'), ui.dim(`month · ${rows.length} results`)))
  list.push(blank())
  let currentDate = ''
  for (const tx of rows) {
    if (tx.date !== currentDate) {
      if (currentDate !== '') list.push(blank())
      list.push(indent(ui.strong(tx.date)))
      currentDate = tx.date
    }
    const color = colorForType(tx.type)
    const amount = pad(color(formatSignedAmount(tx.type, tx.amount)), 16, 'left')
    const category = pad(ui.accent(tx.category), 22)
    const description = ui.dim(tx.description)
    list.push(`${indent('')}  ${amount}  ${category} ${description}`)
  }
  list.push(blank())
  process.stdout.write(list.join('\n') + '\n')

  process.stdout.write('=== bal add 12500 supermercado ===\n\n')
  const tick = ui.positive('✓')
  process.stdout.write(`  ${tick} ${ui.dim('registered')} ${ui.accent('expense')} ${ui.strong(formatCLP(12500))} ${ui.dim('in')} ${ui.accent('supermercado')}\n\n`)
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n')
  process.exit(1)
})
