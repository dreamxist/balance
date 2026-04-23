import { Command } from 'commander'
import { registerAddCommand } from './commands/add'
import { registerBalanceCommand } from './commands/balance'
import { renderBanner } from './commands/banner'
import { registerKeyCommand } from './commands/key'
import { registerListCommand } from './commands/list'
import { registerLoginCommand } from './commands/login'

const program = new Command()

program
  .name('bal')
  .description('Balance CLI — personal finance assertion + reconciliation')
  .version('0.1.2')

registerLoginCommand(program)
registerKeyCommand(program)
registerAddCommand(program)
registerBalanceCommand(program)
registerListCommand(program)

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
