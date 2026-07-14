import type { Command } from 'commander'
import {
  createCategorizationRule,
  discardEmailMovement,
  getEmailMovements,
  getUncategorizedTransactions,
  setTransactionCategory,
  type EmailMovement,
  type UncategorizedTransaction,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { formatCLP, padLeft } from '../lib/format'
import {
  intro,
  isInteractive,
  note,
  outro,
  promptConfirm,
  promptSelect,
  selectCategory,
} from '../lib/interactive'
import { formatSignedAmount } from './list'

export function renderInboxList(
  txs: UncategorizedTransaction[],
  staging: EmailMovement[],
): string {
  const lines: string[] = []
  if (txs.length === 0 && staging.length === 0) {
    return '(inbox vacío — todo categorizado)\n'
  }
  if (txs.length > 0) {
    lines.push(`Sin categoría (${txs.length}):`)
    for (const tx of txs) {
      const amount = padLeft(formatSignedAmount(tx.type, tx.amount), 14)
      const badge = tx.type === 'income' ? '  [INGRESO]' : ''
      lines.push(`  ${tx.date}  ${amount}  ${tx.description}${badge}`)
    }
  }
  if (staging.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`Staging (${staging.length}):`)
    for (const row of staging) {
      const label = row.merchant ?? row.counterparty ?? row.source
      const amount = row.amount === null
        ? padLeft('—', 12)
        : padLeft(
          row.currency === 'USD' ? `US$${(row.amount / 100).toFixed(2)}` : formatCLP(row.amount),
          12,
        )
      const detail = row.status === 'error' ? `error: ${row.error_detail ?? 'sin detalle'}` : 'pendiente'
      lines.push(`  ${amount}  ${label} (${detail})`)
    }
  }
  return lines.join('\n') + '\n'
}

export function registerInboxCommand(program: Command): void {
  program
    .command('inbox')
    .description('Review and categorize pending movements')
    .option('--json', 'output JSON instead of interactive review')
    .action(async (opts: { json?: boolean }) => {
      const client = await getAuthedClient()
      const [txs, staging] = await Promise.all([
        getUncategorizedTransactions(client),
        getEmailMovements(client),
      ])

      if (opts.json) {
        process.stdout.write(JSON.stringify({ transactions: txs, staging }) + '\n')
        return
      }

      if (!isInteractive()) {
        process.stdout.write(renderInboxList(txs, staging))
        return
      }

      if (txs.length === 0 && staging.length === 0) {
        process.stdout.write('(inbox vacío — todo categorizado)\n')
        return
      }

      intro(`Inbox: ${txs.length} sin categoría · ${staging.length} en staging`)

      let done = 0
      for (const tx of txs) {
        note(
          `${tx.date}  ${formatSignedAmount(tx.type, tx.amount)}\n${tx.description}`,
          tx.type === 'income' ? 'Ingreso sin categorizar' : 'Movimiento',
        )
        const action = await promptSelect('¿Qué hacemos?', [
          { value: 'categorize', label: 'Categorizar' },
          { value: 'skip', label: 'Saltar' },
          { value: 'quit', label: 'Salir' },
        ])
        if (action === 'quit') break
        if (action === 'skip') continue

        const category = await selectCategory(client)
        await setTransactionCategory(client, tx.id, category)
        done++

        if (tx.type !== 'income') {
          const remember = await promptConfirm(
            `¿Recordar regla "${tx.description.toUpperCase()}" → ${category}?`,
            false,
          )
          if (remember) {
            await createCategorizationRule(client, {
              pattern: tx.description.toUpperCase(),
              category,
            })
          }
        }
      }

      for (const row of staging) {
        const label = row.merchant ?? row.counterparty ?? row.source
        note(
          `${row.amount === null ? 'sin monto' : row.currency === 'USD' ? `US$${(row.amount / 100).toFixed(2)}` : formatCLP(row.amount)}  ${label}\n${
            row.status === 'error' ? `error: ${row.error_detail ?? 'sin detalle'}` : 'pendiente de promoción'
          }`,
          'Staging',
        )
        const action = await promptSelect('¿Qué hacemos?', [
          { value: 'skip', label: 'Dejar' },
          { value: 'discard', label: 'Descartar' },
          { value: 'quit', label: 'Salir' },
        ])
        if (action === 'quit') break
        if (action === 'discard') {
          const sure = await promptConfirm(
            `¿Descartar "${label}"? No se promoverá nunca a transacción.`,
            false,
          )
          if (sure) await discardEmailMovement(client, row.id)
        }
      }

      outro(`${done} movimiento${done === 1 ? '' : 's'} categorizado${done === 1 ? '' : 's'}.`)
    })
}
