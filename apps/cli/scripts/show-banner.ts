import figlet from 'figlet'
import { blank, chip, indent, kv, ruleLabel, ui } from '../src/lib/ui'

const lines: string[] = []
const logo = figlet.textSync('BALANCE', { font: 'ANSI Shadow' })
lines.push(blank())
for (const row of logo.split('\n')) {
  if (row.trim() === '') continue
  lines.push('  ' + ui.logo(row))
}
lines.push(blank())
lines.push(indent(ui.dim('every coin located, every coin explained.') + '   ' + ui.muted('v0.1.2')))
lines.push(blank())
lines.push(ruleLabel('start'))
lines.push(blank())
lines.push(indent(ui.positive('bal login') + ui.dim(' --api-key bal_...')))
lines.push(indent(ui.positive('bal balance')))
lines.push(indent(ui.positive('bal add') + ui.dim(' 12500 supermercado --account "Wallet"')))
lines.push(indent(ui.positive('bal list') + ui.dim(' --period month --type expense')))
lines.push(blank())
lines.push(ruleLabel('about'))
lines.push(blank())
lines.push(kv('docs', ui.accent('github.com/dreamxist/balance')))
lines.push(kv('status', chip('logged in · expires in 2h', 'positive')))
lines.push(kv('runtime', ui.muted('node 22 · supabase · self-hosted')))
lines.push(blank())
lines.push(indent(ui.dim('run ') + ui.strong('bal --help') + ui.dim(' for all commands')))
lines.push(blank())
process.stdout.write(lines.join('\n') + '\n')
