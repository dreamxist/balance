import type { Command } from 'commander'
import { receivePayment } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP } from '../lib/format'
import { resolveAccountId } from '../lib/resolve'
import { parseAmount } from './add'

interface PayOptions {
  to?: string
  note: string
  date?: string
  json?: boolean
}

function registerPay(group: Command): void {
  group
    .command('pay <receivable> <amount>')
    .description('Record a payment received from a receivable (e.g. someone paid you back)')
    .requiredOption('--to <name|id>', 'destination account (where the money landed)')
    .option('--note <text>', 'description', '')
    .option('--date <YYYY-MM-DD>', 'payment date (default today)')
    .option('--json', 'output JSON')
    .action(async (receivableRef: string, amountRaw: string, opts: PayOptions) => {
      let amount: number
      try {
        amount = parseAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      if (!opts.to) fail('--to is required')

      const client = await getAuthedClient()
      const [receivableId, destinationId] = await Promise.all([
        resolveAccountId(client, receivableRef),
        resolveAccountId(client, opts.to),
      ])

      const result = await receivePayment(client, {
        receivableId,
        destinationId,
        amount,
        description: opts.note,
        date: opts.date,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(
          `Received ${formatCLP(amount)} from "${receivableRef}" into "${opts.to}"\n`,
        )
      }
    })
}

export function registerReceivableCommand(program: Command): void {
  const group = program
    .command('receivable')
    .description('Manage receivables (money owed to you)')
  registerPay(group)
}
