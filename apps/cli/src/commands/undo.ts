import type { Command } from 'commander'
import { undoTransaction } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { isUuid } from '../lib/resolve'

interface UndoOptions {
  json?: boolean
}

export function registerUndoCommand(program: Command): void {
  program
    .command('undo <txId>')
    .description('Reverse a transaction by creating a compensating adjustment (immutable ledger)')
    .option('--json', 'output JSON')
    .action(async (txId: string, opts: UndoOptions) => {
      if (!isUuid(txId)) fail(`invalid transaction id: ${txId}. Expected a UUID.`)

      const client = await getAuthedClient()
      const result = await undoTransaction(client, txId)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Undone ${txId}\n`)
      }
    })
}
