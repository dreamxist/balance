import type { Command } from 'commander'
import { createTransfer } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP } from '../lib/format'
import { resolveAccountId } from '../lib/resolve'
import { parseAmount } from './add'

interface TransferOptions {
  from?: string
  to?: string
  note: string
  date?: string
  json?: boolean
}

export function registerTransferCommand(program: Command): void {
  program
    .command('transfer <amount>')
    .description('Move money between two accounts (does not affect accumulated)')
    .requiredOption('--from <name|id>', 'source account')
    .requiredOption('--to <name|id>', 'destination account')
    .option('--note <text>', 'description', '')
    .option('--date <YYYY-MM-DD>', 'transaction date (default today)')
    .option('--json', 'output JSON')
    .action(async (amountRaw: string, opts: TransferOptions) => {
      let amount: number
      try {
        amount = parseAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      if (!opts.from) fail('--from is required')
      if (!opts.to) fail('--to is required')
      if (opts.from === opts.to) fail('--from and --to cannot be the same account')

      const client = await getAuthedClient()
      const [fromAccountId, toAccountId] = await Promise.all([
        resolveAccountId(client, opts.from),
        resolveAccountId(client, opts.to),
      ])
      if (fromAccountId === toAccountId) fail('--from and --to resolve to the same account')

      const result = await createTransfer(client, {
        fromAccountId,
        toAccountId,
        amount,
        description: opts.note,
        date: opts.date,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(
          `Transferred ${formatCLP(amount)} from ${opts.from} to ${opts.to}\n`,
        )
      }
    })
}
