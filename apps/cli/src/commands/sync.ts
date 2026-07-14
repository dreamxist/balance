import type { Command } from 'commander'
import { triggerGmailSync, type GmailSyncSummary } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { isIsoDate } from '../lib/period'

export function renderSyncSummary(summary: GmailSyncSummary): string {
  const lines = [
    `Sync desde ${summary.since.slice(0, 10)}`,
    `  correos nuevos     ${summary.fetched}`,
    `  parseados          ${summary.parsed}`,
    `  ignorados (ruido)  ${summary.ignored}`,
    `  promovidos         ${summary.promoted}`,
    `  pendientes         ${summary.pending}`,
    `  errores            ${summary.errors}`,
  ]
  if (summary.skipped_existing > 0) {
    lines.push(`  duplicados         ${summary.skipped_existing}`)
  }
  if (summary.usd_rate === null) {
    lines.push('  (sin tipo de cambio USD — compras USD quedan pendientes)')
  }
  for (const failure of summary.failures) {
    lines.push(`  ! ${failure}`)
  }
  return lines.join('\n') + '\n'
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Fetch bank emails from Gmail and promote them (gmail-sync)')
    .option('--since <YYYY-MM-DD>', 'backfill from this date (overrides watermark)')
    .option('--json', 'output JSON')
    .action(async (opts: { since?: string; json?: boolean }) => {
      if (opts.since && !isIsoDate(opts.since)) {
        fail(`invalid --since: ${opts.since}. Expected YYYY-MM-DD`)
      }
      const client = await getAuthedClient()
      const summary = await triggerGmailSync(client, { since: opts.since })
      if (opts.json) {
        process.stdout.write(JSON.stringify(summary) + '\n')
        return
      }
      process.stdout.write(renderSyncSummary(summary))
    })
}
