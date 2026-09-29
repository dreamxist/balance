import type { Command } from 'commander'
import {
  triggerFintocSync,
  triggerGmailSync,
  type FintocSyncSummary,
  type GmailSyncSummary,
} from '@balance/core'
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

export function renderFintocSummary(summary: FintocSyncSummary): string {
  if (!summary.configured) return ''
  const lines = [
    `Fintoc desde ${summary.since ?? '?'}`,
    `  movimientos nuevos ${summary.fetched ?? 0}`,
    `  ignorados          ${summary.ignored ?? 0}`,
    `  promovidos         ${summary.promoted ?? 0}`,
    `  errores            ${summary.errors ?? 0}`,
  ]
  if ((summary.skipped_existing ?? 0) > 0) {
    lines.push(`  duplicados         ${summary.skipped_existing}`)
  }
  for (const failure of summary.failures ?? []) {
    lines.push(`  ! ${failure}`)
  }
  return lines.join('\n') + '\n'
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Fetch bank emails (gmail-sync) and bank movements (fintoc-sync), then promote them')
    .option('--since <YYYY-MM-DD>', 'backfill Gmail from this date (overrides watermark)')
    .option('--json', 'output JSON')
    .action(async (opts: { since?: string; json?: boolean }) => {
      if (opts.since && !isIsoDate(opts.since)) {
        fail(`invalid --since: ${opts.since}. Expected YYYY-MM-DD`)
      }
      const client = await getAuthedClient()
      const summary = await triggerGmailSync(client, { since: opts.since })

      let fintoc: FintocSyncSummary | null = null
      let fintocError: string | null = null
      try {
        fintoc = await triggerFintocSync(client)
      } catch (err) {
        fintocError = err instanceof Error ? err.message : String(err)
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ ...summary, fintoc, fintoc_error: fintocError }) + '\n')
      } else {
        process.stdout.write(renderSyncSummary(summary))
        if (fintoc) process.stdout.write(renderFintocSummary(fintoc))
      }
      if (fintocError) {
        process.stderr.write(`Fintoc: ${fintocError}\n`)
        process.exitCode = 1
      }
    })
}
