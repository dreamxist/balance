import { writeFileSync } from 'node:fs'
import type { Command } from 'commander'
import { exportAllData, exportTableAsCsv } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'

const VALID_FORMATS = ['json', 'csv'] as const
type ExportFormat = (typeof VALID_FORMATS)[number]

function isFormat(v: string): v is ExportFormat {
  return (VALID_FORMATS as readonly string[]).includes(v)
}

interface ExportOptions {
  format: string
  output?: string
}

export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export all data (accounts, transactions, debts, categories, snapshots, recurring)')
    .option('--format <format>', `one of: ${VALID_FORMATS.join('|')}`, 'json')
    .option('--output <path>', 'write to file instead of stdout')
    .action(async (opts: ExportOptions) => {
      if (!isFormat(opts.format)) {
        fail(`invalid --format: ${opts.format}. One of: ${VALID_FORMATS.join(', ')}`)
      }

      const client = await getAuthedClient()
      const data = await exportAllData(client)

      let output: string
      if (opts.format === 'json') {
        output = JSON.stringify(data, null, 2)
      } else {
        const sections: string[] = []
        for (const [table, rows] of Object.entries(data.tables)) {
          sections.push(`# ${table}`)
          sections.push(exportTableAsCsv(rows, table))
          sections.push('')
        }
        output = sections.join('\n')
      }

      if (opts.output) {
        writeFileSync(opts.output, output)
        process.stdout.write(`Wrote ${opts.output}\n`)
      } else {
        process.stdout.write(output + '\n')
      }
    })
}
