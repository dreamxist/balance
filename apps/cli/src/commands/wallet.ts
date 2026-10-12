import type { Command } from 'commander'
import { getUnmappedWalletCards, linkWalletCard, type UnmappedWalletCard } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padRight } from '../lib/format'
import { resolveAccountId } from '../lib/resolve'

export function renderUnmapped(cards: UnmappedWalletCard[]): string {
  if (cards.length === 0) return 'Todas las tarjetas de Apple Pay tienen cuenta asignada.\n'
  const lines = [`${padRight('TARJETA (Wallet)', 32)}${padRight('PAGOS', 7)}TOTAL`]
  for (const c of cards) {
    lines.push(`${padRight(c.card, 32)}${padRight(String(c.payments), 7)}${formatCLP(c.total)}`)
  }
  lines.push('', 'Asigna con: bal wallet link "<tarjeta>" --account "<cuenta>"')
  return lines.join('\n') + '\n'
}

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Apple Pay cards: list unmapped cards and link them to accounts')
    .option('--json', 'output JSON')
    .action(async (opts: { json?: boolean }) => {
      const client = await getAuthedClient()
      const cards = await getUnmappedWalletCards(client)
      if (opts.json) {
        process.stdout.write(JSON.stringify(cards) + '\n')
        return
      }
      process.stdout.write(renderUnmapped(cards))
    })

  wallet
    .command('link <card>')
    .description('Map a Wallet card name to an account and book its pending payments')
    .requiredOption('--account <name|id>', 'account name (fuzzy) or uuid')
    .option('--json', 'output JSON')
    .action(async (card: string, opts: { account: string; json?: boolean }) => {
      if (!card.trim()) fail('card is required')
      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, opts.account)
      const result = await linkWalletCard(client, card, accountId)
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
        return
      }
      process.stdout.write(`"${result.card}" → ${result.account} · ${result.booked} pago(s) registrado(s)\n`)
    })
}
