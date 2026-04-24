import type { Command } from 'commander'
import {
  archiveDebt,
  createInstallmentPurchase,
  getActiveDebts,
  payDebtInstallment,
  payOffDebt,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft, padRight } from '../lib/format'
import { isUuid, resolveAccountId } from '../lib/resolve'
import { parseAmount } from './add'

interface DebtRow {
  id: string
  description: string | null
  total_amount?: number | null
  paid_amount?: number | null
  remaining?: number | null
  installments?: number | null
  installments_paid?: number | null
  next_payment_date?: string | null
  account_id?: string | null
  category?: string | null
}

async function resolveDebtId(client: Awaited<ReturnType<typeof getAuthedClient>>, ref: string): Promise<string> {
  if (isUuid(ref)) return ref
  const debts = (await getActiveDebts(client)) as DebtRow[] | null
  const matches = (debts ?? []).filter((d) =>
    (d.description ?? '').toLowerCase().includes(ref.toLowerCase()),
  )
  if (matches.length === 0) throw new Error(`No active debt matches "${ref}"`)
  if (matches.length > 1) {
    const descriptions = matches.map((d) => `"${d.description ?? d.id}"`).join(', ')
    throw new Error(`Ambiguous debt "${ref}". Matches: ${descriptions}. Use the uuid.`)
  }
  return matches[0]!.id
}

interface ListOptions {
  json?: boolean
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('List active debts')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const client = await getAuthedClient()
      const debts = ((await getActiveDebts(client)) ?? []) as DebtRow[]

      if (opts.json) {
        process.stdout.write(JSON.stringify(debts) + '\n')
        return
      }

      if (debts.length === 0) {
        process.stdout.write('(no active debts)\n')
        return
      }

      const lines: string[] = []
      lines.push(
        `${padRight('DESCRIPTION', 28)}${padLeft('TOTAL', 14)}${padLeft('PAID', 14)}${padLeft('LEFT', 14)}  PROGRESS`,
      )
      for (const d of debts) {
        const total = d.total_amount ?? 0
        const paid = d.paid_amount ?? 0
        const left = d.remaining ?? total - paid
        const progress =
          d.installments && d.installments > 0
            ? `${d.installments_paid ?? 0}/${d.installments}`
            : ''
        lines.push(
          padRight((d.description ?? d.id).slice(0, 28), 28) +
            padLeft(formatCLP(total), 14) +
            padLeft(formatCLP(paid), 14) +
            padLeft(formatCLP(left), 14) +
            '  ' +
            progress,
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface CreateOptions {
  account?: string
  note: string
  date?: string
  firstPaymentDate?: string
  json?: boolean
}

function registerCreate(group: Command): void {
  group
    .command('create <amount> <installments> <category>')
    .description('Register an installment purchase (total amount + N cuotas)')
    .requiredOption('--account <name|id>', 'account used for the purchase (usually a credit_card)')
    .option('--note <text>', 'description', '')
    .option('--date <YYYY-MM-DD>', 'purchase date (default today)')
    .option('--first-payment-date <YYYY-MM-DD>', 'first installment date')
    .option('--json', 'output JSON')
    .action(async (amountRaw: string, installmentsRaw: string, category: string, opts: CreateOptions) => {
      let amount: number
      try {
        amount = parseAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      const installments = Number.parseInt(installmentsRaw, 10)
      if (!Number.isInteger(installments) || installments <= 0) {
        fail(`invalid installments: ${installmentsRaw}. Must be a positive integer.`)
      }
      if (!opts.account) fail('--account is required')

      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, opts.account)
      const result = await createInstallmentPurchase(client, {
        amount,
        installments,
        category,
        accountId,
        description: opts.note,
        date: opts.date,
        firstPaymentDate: opts.firstPaymentDate,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(
          `Created debt: ${formatCLP(amount)} in ${installments} cuotas (${category})\n`,
        )
      }
    })
}

interface PayOptions {
  date?: string
  json?: boolean
}

function registerPay(group: Command): void {
  group
    .command('pay <debtRef>')
    .description('Pay one installment of a debt (by uuid or description substring)')
    .option('--date <YYYY-MM-DD>', 'payment date (default today)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: PayOptions) => {
      const client = await getAuthedClient()
      let debtId: string
      try {
        debtId = await resolveDebtId(client, ref)
      } catch (err) {
        fail((err as Error).message)
      }

      const result = await payDebtInstallment(client, debtId, opts.date)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Paid one installment of debt ${debtId}\n`)
      }
    })
}

interface PayoffOptions {
  actualAmount?: string
  json?: boolean
}

function registerPayoff(group: Command): void {
  group
    .command('payoff <debtRef>')
    .description('Pay off a debt entirely (by uuid or description substring)')
    .option('--actual-amount <n>', 'override amount actually paid (e.g. after a discount)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: PayoffOptions) => {
      const client = await getAuthedClient()
      let debtId: string
      try {
        debtId = await resolveDebtId(client, ref)
      } catch (err) {
        fail((err as Error).message)
      }

      let actualAmount: number | undefined
      if (opts.actualAmount) {
        try {
          actualAmount = parseAmount(opts.actualAmount)
        } catch (err) {
          fail((err as Error).message)
        }
      }

      const result = await payOffDebt(client, debtId, actualAmount)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Paid off debt ${debtId}\n`)
      }
    })
}

interface ArchiveOptions {
  json?: boolean
}

function registerArchive(group: Command): void {
  group
    .command('archive <debtRef>')
    .description('Archive a debt (marks as closed)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: ArchiveOptions) => {
      const client = await getAuthedClient()
      let debtId: string
      try {
        debtId = await resolveDebtId(client, ref)
      } catch (err) {
        fail((err as Error).message)
      }

      const result = await archiveDebt(client, debtId)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Archived debt ${debtId}\n`)
      }
    })
}

export function registerDebtCommand(program: Command): void {
  const group = program.command('debt').description('Manage debts and installment payments')
  registerList(group)
  registerCreate(group)
  registerPay(group)
  registerPayoff(group)
  registerArchive(group)
}
