import figlet from 'figlet'
import { isExpired, loadSession } from '../lib/session'
import { blank, chip, indent, kv, ruleLabel, ui } from '../lib/ui'

const VERSION = '0.1.2'
const TAGLINE = 'every coin located, every coin explained.'
const DOCS_URL = 'github.com/dreamxist/balance'

export async function renderBanner(): Promise<string> {
  const lines: string[] = []

  const logo = figlet.textSync('BALANCE', { font: 'ANSI Shadow' })
  lines.push(blank())
  for (const row of logo.split('\n')) {
    if (row.trim() === '') continue
    lines.push('  ' + ui.logo(row))
  }
  lines.push(blank())
  lines.push(indent(ui.dim(TAGLINE) + '   ' + ui.muted(`v${VERSION}`)))
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
  lines.push(kv('docs', ui.accent(DOCS_URL)))
  lines.push(kv('status', await loginStatus()))
  lines.push(kv('runtime', ui.muted('node 22 · supabase · self-hosted')))
  lines.push(blank())
  lines.push(indent(ui.dim('run ') + ui.strong('bal --help') + ui.dim(' for all commands')))
  lines.push(blank())

  return lines.join('\n')
}

async function loginStatus(): Promise<string> {
  const session = await loadSession()
  if (!session) return chip('not logged in · run bal login', 'muted')
  if (isExpired(session)) return chip('session expired · run bal login', 'warn')
  const minutes = Math.max(0, Math.round((session.expires_at - Date.now()) / 60_000))
  const label = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`
  return chip(`logged in · expires in ${label}`, 'positive')
}

