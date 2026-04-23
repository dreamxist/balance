import figlet from 'figlet'
import { formatCLP } from '../src/lib/format'
import { blank, chip, divider, headerLine, indent, pad, ruleLabel, ui } from '../src/lib/ui'

const lines: string[] = []

const logo = figlet.textSync('BALANCE', { font: 'ANSI Shadow' })
lines.push(blank())
for (const row of logo.split('\n')) {
  if (row.trim() === '') continue
  lines.push('  ' + ui.logo(row))
}
lines.push(blank())
lines.push(indent(ui.dim('every peso located, every peso explained.')))
lines.push(blank())
lines.push(blank())

const rec = { position: 10_000_000, accumulated: 10_000_000, delta: 0, is_balanced: true }
const accounts = [
  { name: 'Demo Bank Corriente', balance: 2_500_000 },
  { name: 'Demo Cuenta Vista', balance: 1_500_000 },
  { name: 'Demo Wallet', balance: 1_000_000 },
  { name: 'Demo Fondo Mutuo', balance: 5_000_000 },
]
const labelW = 14
const amountW = 16
const row = (label: string, value: string, trailing = ''): string => {
  const pair = `${ui.dim(pad(label, labelW))}${pad(value, amountW, 'left')}`
  return indent(trailing ? `${pair}  ${trailing}` : pair)
}

lines.push(headerLine(ui.title('RECONCILIATION'), ui.dim('2026-04-23')))
lines.push(blank())
lines.push(row('Position', formatCLP(rec.position)))
lines.push(row('Accumulated', formatCLP(rec.accumulated)))
lines.push(divider(labelW + amountW))
lines.push(row('Delta', ui.positive(formatCLP(rec.delta)), chip('balanced', 'positive')))
lines.push(blank())

lines.push(headerLine(ui.title('ACCOUNTS'), ui.dim(`${accounts.length} total`)))
lines.push(blank())
const nameW = Math.max(...accounts.map((a) => a.name.length), 20)
for (const a of accounts) {
  lines.push(indent(`${pad(a.name, nameW)}  ${pad(ui.strong(formatCLP(a.balance)), amountW, 'left')}`))
}
lines.push(blank())
lines.push(blank())

lines.push(ruleLabel('install'))
lines.push(blank())
lines.push(indent(ui.positive('npm install -g ') + ui.strong('@dreamxist/bal-cli')))
lines.push(blank())
lines.push(indent(ui.dim('open source · MIT · ') + ui.accent('github.com/dreamxist/balance')))
lines.push(blank())

process.stdout.write(lines.join('\n') + '\n')
