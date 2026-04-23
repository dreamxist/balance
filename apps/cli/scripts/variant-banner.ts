import figlet from 'figlet'
import { ui, blank, indent, ruleLabel } from '../src/lib/ui'

const font = (process.argv[2] ?? 'ANSI Shadow') as figlet.Fonts
const logo = figlet.textSync('BALANCE', { font })
const lines: string[] = []
lines.push(blank())
for (const row of logo.split('\n')) {
  if (row.trim() === '') continue
  lines.push('  ' + ui.logo(row))
}
lines.push(blank())
lines.push(indent(ui.dim('every peso located, every peso explained.') + '   ' + ui.muted('v0.1.2')))
lines.push(blank())
lines.push(ruleLabel('start'))
lines.push(blank())
lines.push(indent(ui.positive('bal login') + ui.dim(' --api-key bal_...')))
lines.push(indent(ui.positive('bal balance')))
lines.push(indent(ui.positive('bal add') + ui.dim(' 12500 supermercado')))
lines.push(blank())
process.stdout.write(lines.join('\n') + '\n')
