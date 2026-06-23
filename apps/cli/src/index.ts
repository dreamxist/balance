import { Command } from 'commander'
import { registerAccountCommand } from './commands/account'
import { registerAddCommand } from './commands/add'
import { registerBalanceCommand } from './commands/balance'
import { renderBanner } from './commands/banner'
import { registerCategoryCommand } from './commands/category'
import { registerDebtCommand } from './commands/debt'
import { registerExportCommand } from './commands/export'
import { registerFintualCommand } from './commands/fintual'
import { registerKeyCommand } from './commands/key'
import { registerListCommand } from './commands/list'
import { registerLoginCommand } from './commands/login'
import { registerPatrimonioCommand } from './commands/patrimonio'
import { registerReceivableCommand } from './commands/receivable'
import { registerRecurringCommand } from './commands/recurring'
import { registerSnapshotCommand } from './commands/snapshot'
import { registerSpaCommand } from './commands/spa'
import { registerTransferCommand } from './commands/transfer'
import { registerUndoCommand } from './commands/undo'

const program = new Command()

program
  .name('bal')
  .description('Balance CLI — personal finance assertion + reconciliation')
  .version('0.2.1')

registerLoginCommand(program)
registerKeyCommand(program)
registerAddCommand(program)
registerBalanceCommand(program)
registerListCommand(program)
registerTransferCommand(program)
registerUndoCommand(program)
registerAccountCommand(program)
registerDebtCommand(program)
registerReceivableCommand(program)
registerCategoryCommand(program)
registerRecurringCommand(program)
registerSnapshotCommand(program)
registerExportCommand(program)
registerFintualCommand(program)
registerSpaCommand(program)
registerPatrimonioCommand(program)

async function main(): Promise<void> {
  if (process.argv.length <= 2) {
    process.stdout.write(await renderBanner())
    return
  }
  await program.parseAsync(process.argv)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
})
