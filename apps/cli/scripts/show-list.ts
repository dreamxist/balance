import { formatSignedAmount } from '../src/commands/list'
import { blank, headerLine, indent, pad, ui } from '../src/lib/ui'

function colorForType(type: string): (s: string) => string {
  if (type === 'expense' || type === 'debt_payment') return ui.negative
  if (type === 'income' || type === 'refund') return ui.positive
  return ui.muted
}

const rows = [
  { date: '2026-04-22', type: 'expense', amount: 10000, category: 'supermercado', description: 'Demo Market' },
  { date: '2026-04-22', type: 'expense', amount: 5000, category: 'transporte', description: 'Demo Ride' },
  { date: '2026-04-21', type: 'income', amount: 2_000_000, category: 'sueldo', description: 'Demo Corp' },
  { date: '2026-04-21', type: 'expense', amount: 30_000, category: 'restaurantes', description: 'Demo Resto' },
  { date: '2026-04-20', type: 'debt_payment', amount: 100_000, category: 'deuda', description: 'Cuota demo 1/12' },
  { date: '2026-04-19', type: 'refund', amount: 15000, category: 'devoluciones', description: 'Demo Shop' },
]

const lines: string[] = []
lines.push(blank())
lines.push(headerLine(ui.title('TRANSACTIONS'), ui.dim(`month · ${rows.length} results`)))
lines.push(blank())

let currentDate = ''
for (const tx of rows) {
  if (tx.date !== currentDate) {
    if (currentDate !== '') lines.push(blank())
    lines.push(indent(ui.strong(tx.date)))
    currentDate = tx.date
  }
  const color = colorForType(tx.type)
  const amount = pad(color(formatSignedAmount(tx.type, tx.amount)), 16, 'left')
  const category = pad(ui.accent(tx.category), 22)
  const description = ui.dim(tx.description)
  lines.push(`${indent('')}  ${amount}  ${category} ${description}`)
}
lines.push(blank())

process.stdout.write(lines.join('\n') + '\n')
