import { formatCLP } from '../src/lib/format'
import { blank, chip, divider, headerLine, indent, pad, ui } from '../src/lib/ui'

const rec = { position: 10_000_000, accumulated: 10_000_000, delta: 0, is_balanced: true, delta_status: 'balanced' }
const accounts = [
  { name: 'Demo Bank Corriente', balance: 2_500_000 },
  { name: 'Demo Cuenta Vista', balance: 1_500_000 },
  { name: 'Demo Wallet', balance: 1_000_000 },
  { name: 'Demo Fondo Mutuo', balance: 5_000_000 },
]

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
