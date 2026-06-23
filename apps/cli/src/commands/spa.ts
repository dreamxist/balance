import type { Command } from 'commander'
import {
  createInterEntityTransfer,
  createSpaInvoiceV2,
  createTransaction,
  getAccounts,
  getF29Summary,
  getSpaAnnualSummary,
  getSpaDashboard,
  getSpaEmitidas,
  getSpaRecibidas,
  markF29Declared,
  markSpaInvoicePaid,
  parseUsdAmount,
  usdToClp,
  type SupabaseClient,
  type Database,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP, padLeft, padRight } from '../lib/format'
import { resolveAccountId } from '../lib/resolve'
import { parseAmount } from './add'

type Client = SupabaseClient<Database>

const VALID_DIRECTIONS = ['emitida', 'recibida'] as const
type Direction = (typeof VALID_DIRECTIONS)[number]

const VALID_DOC_TYPES = ['factura_afecta', 'factura_exenta', 'factura_exportacion', 'boleta', 'nota_credito'] as const
type DocType = (typeof VALID_DOC_TYPES)[number]

/** Resolve the SpA account id: explicit ref (validated entity='spa') or the single SpA account. */
async function resolveSpaAccount(client: Client, ref?: string): Promise<string> {
  if (ref) {
    const id = await resolveAccountId(client, ref)
    const { data, error } = await client.from('accounts').select('name, entity').eq('id', id).single()
    if (error) throw error
    if (data.entity !== 'spa') {
      fail(`Account "${data.name}" is entity='${data.entity}', not SpA. Use an entity='spa' account.`)
    }
    return id
  }
  const accounts = await getAccounts(client, { entity: 'spa' })
  if (!accounts || accounts.length === 0) fail("No SpA accounts. Create one with entity='spa' or pass --account.")
  if (accounts.length > 1) fail(`Multiple SpA accounts (${accounts.map((a) => a.name).join(', ')}). Use --account.`)
  return accounts[0]!.id
}

function isDirection(v: string): v is Direction {
  return (VALID_DIRECTIONS as readonly string[]).includes(v)
}

function isDocType(v: string): v is DocType {
  return (VALID_DOC_TYPES as readonly string[]).includes(v)
}

export function parseYearMonth(raw: string): { year: number; month: number } {
  const match = raw.match(/^(\d{4})-(\d{1,2})$/)
  if (!match) throw new Error(`invalid month: ${raw}. Expected YYYY-MM`)
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) throw new Error(`invalid month: ${raw}. Month must be 1-12`)
  return { year, month }
}

interface DashboardOptions {
  json?: boolean
}

function registerDashboard(group: Command): void {
  group
    .command('dashboard')
    .description('Show SpA dashboard: accounts, IVA debido, monthly income/expenses')
    .option('--json', 'output JSON')
    .action(async (opts: DashboardOptions) => {
      const client = await getAuthedClient()
      const data = await getSpaDashboard(client)

      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n')
        return
      }

      const lines: string[] = []
      lines.push(`IVA debido (mes actual)   ${padLeft(formatCLP(data.ivaDue), 16)}`)
      lines.push(`Ingresos del mes          ${padLeft(formatCLP(data.monthlyIncome), 16)}`)
      lines.push(`Gastos del mes            ${padLeft(formatCLP(data.monthlyExpenses), 16)}`)
      lines.push('')
      lines.push('Cuentas SpA:')
      for (const a of data.accounts) {
        lines.push(`  ${padRight(a.name, 28)} ${padLeft(formatCLP(a.balance ?? 0), 14)}`)
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface InvoiceListOptions {
  direction?: string
  month?: string
  json?: boolean
}

function registerInvoiceList(invoiceGroup: Command): void {
  invoiceGroup
    .command('list')
    .description('List SpA invoices')
    .option('--direction <direction>', `one of: ${VALID_DIRECTIONS.join('|')}`, 'emitida')
    .option('--month <YYYY-MM>', 'filter by month')
    .option('--json', 'output JSON')
    .action(async (opts: InvoiceListOptions) => {
      const direction = opts.direction ?? 'emitida'
      if (!isDirection(direction)) {
        fail(`invalid --direction: ${direction}. One of: ${VALID_DIRECTIONS.join(', ')}`)
      }
      if (opts.month) {
        try {
          parseYearMonth(opts.month)
        } catch (err) {
          fail((err as Error).message)
        }
      }

      const client = await getAuthedClient()
      const rows =
        direction === 'emitida'
          ? await getSpaEmitidas(client, opts.month)
          : await getSpaRecibidas(client, opts.month)

      if (opts.json) {
        process.stdout.write(JSON.stringify(rows) + '\n')
        return
      }

      if (rows.length === 0) {
        process.stdout.write('(no invoices)\n')
        return
      }

      const lines: string[] = []
      lines.push(
        `${padRight('DATE', 12)}${padRight('COUNTERPART', 28)}${padLeft('NETO', 14)}${padLeft('IVA', 12)}${padLeft('TOTAL', 14)}  STATUS`,
      )
      for (const r of rows) {
        const netoRaw = (r as { neto?: number | null }).neto ?? 0
        const ivaRaw = (r as { iva?: number | null }).iva ?? 0
        const totalRaw = (r as { total?: number | null }).total ?? 0
        const status = (r as { status?: string | null }).status ?? ''
        const counterpart = (r as { counterpart?: string | null }).counterpart ?? ''
        const date = (r as { date?: string | null }).date ?? ''
        lines.push(
          padRight(date, 12) +
            padRight(counterpart, 28) +
            padLeft(formatCLP(netoRaw), 14) +
            padLeft(formatCLP(ivaRaw), 12) +
            padLeft(formatCLP(totalRaw), 14) +
            '  ' +
            status,
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface InvoiceCreateOptions {
  direction?: string
  counterpart?: string
  neto?: string
  docType?: string
  description?: string
  folio?: string
  date?: string
  account?: string
  createTransaction?: boolean
  json?: boolean
}

function registerInvoiceCreate(invoiceGroup: Command): void {
  invoiceGroup
    .command('create')
    .description('Create a SpA invoice (emitida or recibida)')
    .requiredOption('--direction <direction>', `one of: ${VALID_DIRECTIONS.join('|')}`)
    .requiredOption('--counterpart <name>', 'client (emitida) or supplier (recibida)')
    .requiredOption('--neto <amount>', 'neto amount (IVA is computed server-side)')
    .option('--doc-type <type>', `one of: ${VALID_DOC_TYPES.join('|')}`, 'factura_afecta')
    .option('--description <text>', 'line description', '')
    .option('--folio <folio>', 'SII folio number')
    .option('--date <YYYY-MM-DD>', 'invoice date (default today)')
    .option('--account <name|id>', 'associated account (for emitted invoices)')
    .option('--create-transaction', 'also create the transaction for the invoice (default: false)')
    .option('--json', 'output JSON')
    .action(async (opts: InvoiceCreateOptions) => {
      if (!opts.direction || !isDirection(opts.direction)) {
        fail(`invalid --direction: ${opts.direction}. One of: ${VALID_DIRECTIONS.join(', ')}`)
      }
      if (opts.docType && !isDocType(opts.docType)) {
        fail(`invalid --doc-type: ${opts.docType}. One of: ${VALID_DOC_TYPES.join(', ')}`)
      }
      if (!opts.counterpart) fail('--counterpart is required')
      if (!opts.neto) fail('--neto is required')

      let neto: number
      try {
        neto = parseAmount(opts.neto)
      } catch (err) {
        fail((err as Error).message)
      }

      const client = await getAuthedClient()
      let accountId: string | undefined
      if (opts.account) {
        accountId = await resolveAccountId(client, opts.account)
      }

      const result = await createSpaInvoiceV2(client, {
        direction: opts.direction,
        counterpart: opts.counterpart,
        neto,
        docType: (opts.docType as DocType | undefined) ?? undefined,
        description: opts.description,
        folioSii: opts.folio,
        date: opts.date,
        accountId,
        createTransaction: opts.createTransaction,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Created ${opts.direction} invoice for ${opts.counterpart}: ${formatCLP(neto)}\n`)
      }
    })
}

interface InvoicePayOptions {
  account?: string
  json?: boolean
}

function registerInvoicePay(invoiceGroup: Command): void {
  invoiceGroup
    .command('pay <invoiceId>')
    .description('Mark an invoice as paid, settling the balance into an account')
    .requiredOption('--account <name|id>', 'account receiving (emitida) or paying (recibida)')
    .option('--json', 'output JSON')
    .action(async (invoiceId: string, opts: InvoicePayOptions) => {
      if (!opts.account) fail('--account is required')
      const client = await getAuthedClient()
      const accountId = await resolveAccountId(client, opts.account)
      const result = await markSpaInvoicePaid(client, invoiceId, accountId)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Marked invoice ${invoiceId} as paid\n`)
      }
    })
}

function registerInvoice(group: Command): void {
  const invoiceGroup = group.command('invoice').description('Manage SpA invoices')
  registerInvoiceList(invoiceGroup)
  registerInvoiceCreate(invoiceGroup)
  registerInvoicePay(invoiceGroup)
}

interface F29Options {
  json?: boolean
}

function registerF29(group: Command): void {
  group
    .command('f29 <month>')
    .description('Compute F29 summary for a given month (YYYY-MM)')
    .option('--json', 'output JSON')
    .action(async (monthArg: string, opts: F29Options) => {
      let year: number
      let month: number
      try {
        ;({ year, month } = parseYearMonth(monthArg))
      } catch (err) {
        fail((err as Error).message)
      }

      const client = await getAuthedClient()
      const data = await getF29Summary(client, year, month)

      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n')
        return
      }
      process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    })
}

interface AnnualOptions {
  json?: boolean
}

function registerAnnual(group: Command): void {
  group
    .command('annual [year]')
    .description('Annual SpA summary (default: current year)')
    .option('--json', 'output JSON')
    .action(async (yearArg: string | undefined, opts: AnnualOptions) => {
      const year = yearArg ? Number(yearArg) : new Date().getFullYear()
      if (!Number.isInteger(year) || year < 1970) fail(`invalid year: ${yearArg}`)

      const client = await getAuthedClient()
      const data = await getSpaAnnualSummary(client, year)

      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n')
        return
      }
      process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    })
}

interface GastoOptions {
  moneda: string
  tc?: string
  account?: string
  note: string
  date?: string
  json?: boolean
}

function registerGasto(group: Command): void {
  group
    .command('gasto <amount> <category>')
    .description('SpA expense (e.g. foreign SaaS, no VAT credit). USD converts to CLP.')
    .option('--moneda <CLP|USD>', 'amount currency', 'CLP')
    .option('--tc <rate>', 'CLP/USD exchange rate (required with --moneda USD)')
    .option('--account <name|id>', 'SpA account (default: the single SpA account)')
    .option('--note <text>', 'description', '')
    .option('--date <YYYY-MM-DD>', 'date')
    .option('--json', 'output JSON')
    .action(async (amountRaw: string, category: string, opts: GastoOptions) => {
      const moneda = opts.moneda.toUpperCase()
      let raw: number
      let amountClp: number
      if (moneda === 'USD') {
        if (!opts.tc) fail('--tc <rate> is required with --moneda USD')
        raw = parseUsdAmount(amountRaw)
        amountClp = usdToClp(raw, Number(opts.tc))
      } else if (moneda === 'CLP') {
        raw = parseAmount(amountRaw)
        amountClp = raw
      } else {
        fail(`invalid --moneda: ${opts.moneda}. Use CLP or USD`)
      }
      const client = await getAuthedClient()
      const accountId = await resolveSpaAccount(client, opts.account)
      const note = moneda === 'USD' ? `${opts.note} [USD ${raw} @${opts.tc}]`.trim() : opts.note
      const tx = await createTransaction(client, {
        amount: amountClp,
        category,
        accountId,
        description: note,
        type: 'expense',
        date: opts.date,
      })
      if (opts.json) {
        process.stdout.write(JSON.stringify(tx) + '\n')
      } else {
        process.stdout.write(`SpA expense ${formatCLP(amountClp)} in ${category}\n`)
      }
    })
}

function collectCodes(value: string, prev: Record<string, number>): Record<string, number> {
  const [code, raw] = value.split('=')
  if (!code || raw === undefined) fail(`invalid --codigo: ${value}. Use code=value (e.g. 538=380000)`)
  const n = Number(raw.replace(/[.,\s_]/g, ''))
  if (!Number.isFinite(n)) fail(`invalid --codigo value: ${raw}`)
  return { ...prev, [code]: n }
}

interface F29DeclararOptions {
  folio?: string
  date?: string
  codigo: Record<string, number>
  note?: string
  json?: boolean
}

function registerF29Declarar(group: Command): void {
  group
    .command('f29-declarar <month>')
    .description('Mark an F29 period (YYYY-MM) as declared, storing official SII codes')
    .option('--codigo <code=value>', 'official SII code (repeatable), e.g. --codigo 538=380000', collectCodes, {})
    .option('--folio <n>', 'declaration/confirmation number')
    .option('--date <YYYY-MM-DD>', 'declaration date (default today)')
    .option('--note <text>', 'note')
    .option('--json', 'output JSON')
    .action(async (monthArg: string, opts: F29DeclararOptions) => {
      let year: number
      let month: number
      try {
        ;({ year, month } = parseYearMonth(monthArg))
      } catch (err) {
        fail((err as Error).message)
      }
      const codes = opts.codigo
      const officialCodes = Object.keys(codes).length > 0 ? codes : undefined
      const client = await getAuthedClient()
      const result = await markF29Declared(client, {
        year,
        month,
        declaredAt: opts.date,
        confirmationNumber: opts.folio,
        notes: opts.note,
        officialCodes,
      })
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`F29 ${monthArg} declared${officialCodes ? ' (official codes)' : ' (app estimate)'}\n`)
      }
    })
}

interface SueldoOptions {
  to: string
  account?: string
  note: string
  date?: string
  json?: boolean
}

function registerSueldo(group: Command): void {
  group
    .command('sueldo <amount>')
    .description('Owner salary: inter-entity transfer SpA → personal account')
    .requiredOption('--to <name|id>', 'destination personal account')
    .option('--account <name|id>', 'source SpA account')
    .option('--note <text>', 'description', 'Sueldo empresarial')
    .option('--date <YYYY-MM-DD>', 'date')
    .option('--json', 'output JSON')
    .action(async (amountRaw: string, opts: SueldoOptions) => {
      let amount: number
      try {
        amount = parseAmount(amountRaw)
      } catch (err) {
        fail((err as Error).message)
      }
      const client = await getAuthedClient()
      const fromAccountId = await resolveSpaAccount(client, opts.account)
      const toAccountId = await resolveAccountId(client, opts.to)
      const result = await createInterEntityTransfer(client, {
        fromAccountId,
        toAccountId,
        amount,
        description: opts.note,
        date: opts.date,
      })
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Sueldo ${formatCLP(amount)} SpA → personal\n`)
      }
    })
}

export function registerSpaCommand(program: Command): void {
  const group = program.command('spa').description('Business entity (SpA) operations: invoices, expenses, F29, salary, annual summary')
  registerDashboard(group)
  registerInvoice(group)
  registerGasto(group)
  registerF29(group)
  registerF29Declarar(group)
  registerSueldo(group)
  registerAnnual(group)
}
