import type { Command } from 'commander'
import {
  createRecurringCharge,
  deleteRecurringCharge,
  getRecurringStatus,
  listRecurringDetailed,
  parseUsdAmount,
  payRecurringCharge,
  processDueRecurringCharges,
  updateRecurringCharge,
  usdToClp,
  type RecurringChargeDetailed,
  type RecurringStatusItem,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { formatCLP } from '../lib/format'
import {
  isInteractive,
  promptConfirm,
  promptMultiselect,
  promptSelect,
  promptText,
  selectAccount,
  selectCategory,
} from '../lib/interactive'
import { isIsoDate } from '../lib/period'
import { isUuid, resolveAccountId } from '../lib/resolve'
import { blank, headerLine, indent, pad, ui } from '../lib/ui'
import { parseAmount } from './add'

type Entity = 'personal' | 'spa'

function parseDay(raw: string): number {
  const day = Number.parseInt(raw, 10)
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`invalid day: ${raw}. Must be 1-31.`)
  }
  return day
}

function statusCell(status: string | undefined, autoCharge: boolean, isActive: boolean): string {
  if (!isActive) return ui.dim('inactivo')
  switch (status) {
    case 'charged':
      return ui.muted('✓ cobrado')
    case 'due':
      return autoCharge ? ui.warn('● pendiente') : ui.negative('● pagar tú')
    case 'upcoming':
      return ui.dim('· próximo')
    default:
      return ui.dim('—')
  }
}

// Resolve a charge by uuid or name substring. Prompts to disambiguate in a TTY.
async function resolveCharge(
  client: Awaited<ReturnType<typeof getAuthedClient>>,
  ref: string,
): Promise<RecurringChargeDetailed> {
  const all = await listRecurringDetailed(client, { includeInactive: true })
  if (isUuid(ref)) {
    const match = all.find((c) => c.id === ref)
    if (!match) fail(`No recurring charge with id ${ref}`)
    return match
  }
  const matches = all.filter((c) => c.name.toLowerCase().includes(ref.toLowerCase()))
  if (matches.length === 0) fail(`No recurring charge matches "${ref}"`)
  if (matches.length === 1) return matches[0]!
  if (isInteractive()) {
    const id = await promptSelect(
      `Varios coinciden con "${ref}". Elige uno:`,
      matches.map((c) => ({
        value: c.id,
        label: c.name,
        hint: `día ${c.day_of_month} · ${formatCLP(c.amount)} · ${c.account_name}`,
      })),
    )
    return matches.find((c) => c.id === id)!
  }
  fail(`Ambiguous "${ref}". Matches: ${matches.map((c) => c.name).join(', ')}. Use the uuid.`)
}

interface ListOptions {
  includeInactive?: boolean
  entity?: string
  due?: boolean
  json?: boolean
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('List recurring charges with their monthly status')
    .option('--entity <entity>', 'filter by entity: personal | spa')
    .option('--due', 'show only charges that are due/pending this month')
    .option('--include-inactive', 'include disabled charges')
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      const entity = parseEntityFilter(opts.entity)
      const client = await getAuthedClient()
      const [rows, status] = await Promise.all([
        listRecurringDetailed(client, { entity, includeInactive: opts.includeInactive }),
        getRecurringStatus(client, entity ? { entity } : undefined),
      ])
      const statusById = new Map<string, RecurringStatusItem>(status.map((s) => [s.id, s]))

      let view = rows.map((r) => ({ row: r, st: statusById.get(r.id) }))
      if (opts.due) view = view.filter((v) => v.st?.status === 'due')

      if (opts.json) {
        process.stdout.write(
          JSON.stringify(view.map((v) => ({ ...v.row, status: v.st?.status ?? null, due_date: v.st?.due_date ?? null }))) + '\n',
        )
        return
      }

      if (view.length === 0) {
        process.stdout.write('(no recurring charges)\n')
        return
      }

      const nameW = Math.max(...view.map((v) => v.row.name.length), 16)
      const acctW = Math.max(...view.map((v) => v.row.account_name.length), 12)
      const lines: string[] = []
      lines.push(blank())
      lines.push(headerLine(ui.title('RECURRING'), ui.dim(`${view.length} ${view.length === 1 ? 'charge' : 'charges'}`)))
      lines.push(blank())
      lines.push(
        indent(
          ui.dim(
            `${pad('DAY', 4)}  ${pad('NAME', nameW)}  ${pad('AMOUNT', 11, 'left')}  ${pad('TYPE', 7)}  ${pad('ENTITY', 9)}  ${pad('ACCOUNT', acctW)}  STATUS`,
          ),
        ),
      )
      for (const { row, st } of view) {
        const typeCell = row.auto_charge ? ui.dim('auto') : ui.accent('manual')
        const entityCell = row.entity === 'spa' ? ui.accent('spa') : ui.dim('personal')
        lines.push(
          indent(
            `${pad(String(row.day_of_month), 4)}  ${pad(row.name, nameW)}  ${pad(formatCLP(row.amount), 11, 'left')}  ${pad(typeCell, 7)}  ${pad(entityCell, 9)}  ${pad(row.account_name, acctW)}  ${statusCell(st?.status, row.auto_charge, row.is_active)}`,
          ),
        )
      }
      lines.push(blank())
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface CreateOptions {
  day?: string
  category?: string
  account?: string
  currency?: string
  usd?: string
  rate?: string
  auto?: boolean
  manual?: boolean
  json?: boolean
}

function registerCreate(group: Command): void {
  group
    .command('create [name] [amount]')
    .description('Create a recurring charge (interactive when args are omitted)')
    .option('--day <1-31>', 'day of month to charge')
    .option('--category <id>', 'category id (e.g. necesidad.suscripciones)')
    .option('--account <name|id>', 'account to charge')
    .option('--currency <code>', 'ISO 4217 currency code', 'CLP')
    .option('--usd <amount>', 'amount in USD (requires --rate); stored as CLP')
    .option('--rate <clp>', 'CLP per USD, used with --usd')
    .option('--auto', 'automatic charge — debited on its own (default)')
    .option('--manual', 'manual charge — you pay it yourself')
    .option('--json', 'output JSON')
    .action(async (nameArg: string | undefined, amountArg: string | undefined, opts: CreateOptions) => {
      const client = await getAuthedClient()
      const interactive = isInteractive() && !opts.json

      let name = nameArg
      if (!name) {
        if (!interactive) fail('name is required')
        name = await promptText('Nombre del cargo', {
          validate: (v) => (v.trim() ? undefined : 'requerido'),
        })
      }

      let autoCharge: boolean
      if (opts.manual) autoCharge = false
      else if (opts.auto) autoCharge = true
      else if (interactive) {
        autoCharge =
          (await promptSelect('Tipo de cobro', [
            { value: 'auto', label: 'Automático', hint: 'se descuenta solo (tarjeta/cargo)' },
            { value: 'manual', label: 'Manual', hint: 'lo pagas tú y lo confirmas' },
          ])) === 'auto'
      } else autoCharge = true

      const amount = await resolveAmount(amountArg, opts, interactive)

      let day: number
      if (opts.day) {
        try {
          day = parseDay(opts.day)
        } catch (err) {
          fail((err as Error).message)
        }
      } else if (interactive) {
        day = parseDay(
          await promptText('Día del mes (1-31)', {
            validate: (v) => {
              try {
                parseDay(v)
                return undefined
              } catch (err) {
                return (err as Error).message
              }
            },
          }),
        )
      } else fail('--day is required')

      let accountId: string
      if (opts.account) accountId = await resolveAccountId(client, opts.account)
      else if (interactive) {
        const entity = await promptSelect<Entity>('Entidad', [
          { value: 'personal', label: 'Personal' },
          { value: 'spa', label: 'SpA' },
        ])
        accountId = await selectAccount(client, { entity, message: 'Cuenta a cargar' })
      } else fail('--account is required')

      let category: string
      if (opts.category) category = opts.category
      else if (interactive) category = await selectCategory(client, { message: 'Categoría' })
      else fail('--category is required')

      const created = await createRecurringCharge(client, {
        name,
        amount,
        dayOfMonth: day,
        category,
        accountId,
        currency: opts.currency ?? 'CLP',
        autoCharge,
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify(created) + '\n')
      } else {
        const kind = autoCharge ? 'auto' : 'manual'
        process.stdout.write(
          `  ${ui.positive('✓')} ${ui.dim('created')} ${ui.strong(name)} ${ui.dim('·')} ${ui.strong(formatCLP(amount))} ${ui.dim(`· día ${day} · ${kind}`)}\n`,
        )
      }
    })
}

interface EditOptions {
  name?: string
  amount?: string
  day?: string
  category?: string
  account?: string
  usd?: string
  rate?: string
  auto?: boolean
  manual?: boolean
  active?: boolean
  inactive?: boolean
  json?: boolean
}

function registerEdit(group: Command): void {
  group
    .command('edit <ref>')
    .description('Edit a recurring charge (by uuid or name; interactive without flags)')
    .option('--name <text>', 'new name')
    .option('--amount <amount>', 'new amount (CLP)')
    .option('--day <1-31>', 'new day of month')
    .option('--category <id>', 'new category id')
    .option('--account <name|id>', 'new account')
    .option('--usd <amount>', 'set amount from USD (requires --rate)')
    .option('--rate <clp>', 'CLP per USD, used with --usd')
    .option('--auto', 'mark as automatic')
    .option('--manual', 'mark as manual')
    .option('--active', 'reactivate')
    .option('--inactive', 'deactivate')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: EditOptions) => {
      const client = await getAuthedClient()
      const charge = await resolveCharge(client, ref)
      const interactive = isInteractive() && !opts.json
      const hasFlags = Boolean(
        opts.name || opts.amount || opts.day || opts.category || opts.account || opts.usd || opts.auto || opts.manual || opts.active || opts.inactive,
      )

      const patch: Parameters<typeof updateRecurringCharge>[2] = {}

      if (!hasFlags && interactive) {
        const field = await promptSelect('¿Qué editar?', [
          { value: 'amount', label: 'Monto', hint: formatCLP(charge.amount) },
          { value: 'day', label: 'Día del mes', hint: String(charge.day_of_month) },
          { value: 'category', label: 'Categoría', hint: charge.category },
          { value: 'account', label: 'Cuenta', hint: charge.account_name },
          { value: 'auto', label: 'Tipo (auto/manual)', hint: charge.auto_charge ? 'auto' : 'manual' },
          { value: 'active', label: 'Activar/desactivar', hint: charge.is_active ? 'activo' : 'inactivo' },
          { value: 'name', label: 'Nombre', hint: charge.name },
        ])
        if (field === 'amount') patch.amount = parseAmount(await promptText('Nuevo monto (CLP)'))
        else if (field === 'day') patch.dayOfMonth = parseDay(await promptText('Nuevo día (1-31)'))
        else if (field === 'category') patch.category = await selectCategory(client, { entity: charge.entity })
        else if (field === 'account') patch.accountId = await selectAccount(client, { entity: charge.entity, message: 'Nueva cuenta' })
        else if (field === 'name') patch.name = await promptText('Nuevo nombre')
        else if (field === 'auto') {
          patch.autoCharge =
            (await promptSelect('Tipo', [
              { value: 'auto', label: 'Automático' },
              { value: 'manual', label: 'Manual' },
            ])) === 'auto'
        } else if (field === 'active') patch.isActive = await promptConfirm('¿Activo?', charge.is_active)
      } else {
        if (opts.name) patch.name = opts.name
        if (opts.amount) patch.amount = parseAmount(opts.amount)
        if (opts.usd) {
          if (!opts.rate) fail('--rate <clp> is required with --usd')
          patch.amount = usdToClp(parseUsdAmount(opts.usd), Number(opts.rate))
        }
        if (opts.day) patch.dayOfMonth = parseDay(opts.day)
        if (opts.category) patch.category = opts.category
        if (opts.account) patch.accountId = await resolveAccountId(client, opts.account)
        if (opts.manual) patch.autoCharge = false
        if (opts.auto) patch.autoCharge = true
        if (opts.inactive) patch.isActive = false
        if (opts.active) patch.isActive = true
      }

      if (Object.keys(patch).length === 0) fail('nothing to update')

      const updated = await updateRecurringCharge(client, charge.id, patch)
      if (opts.json) {
        process.stdout.write(JSON.stringify(updated) + '\n')
      } else {
        process.stdout.write(`  ${ui.positive('✓')} ${ui.dim('updated')} ${ui.strong(updated.name)}\n`)
      }
    })
}

interface PayOptions {
  amount?: string
  date?: string
  json?: boolean
}

function registerPay(group: Command): void {
  group
    .command('pay <ref>')
    .description('Register a (manual) recurring charge as paid now')
    .option('--amount <amount>', 'override amount for this payment (CLP)')
    .option('--date <YYYY-MM-DD>', 'payment date (default today)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: PayOptions) => {
      const client = await getAuthedClient()
      const charge = await resolveCharge(client, ref)
      const interactive = isInteractive() && !opts.json

      if (opts.date && !isIsoDate(opts.date)) fail(`invalid --date: ${opts.date}`)
      const amount = opts.amount ? parseAmount(opts.amount) : undefined

      if (interactive) {
        const shown = formatCLP(amount ?? charge.amount)
        const ok = await promptConfirm(`Registrar pago de "${charge.name}" por ${shown} en ${charge.account_name}?`)
        if (!ok) {
          process.stdout.write('cancelado\n')
          return
        }
      }

      const result = await payRecurringCharge(client, { chargeId: charge.id, date: opts.date, amount })
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
        return
      }
      if (result.status === 'charged') {
        process.stdout.write(`  ${ui.positive('✓')} ${ui.dim('paid')} ${ui.strong(charge.name)} ${ui.strong(formatCLP(result.amount ?? 0))}\n`)
      } else {
        process.stdout.write(`  ${ui.warn('•')} ${charge.name}: ${result.status}${result.reason ? ` (${result.reason})` : ''}\n`)
      }
    })
}

interface SyncOptions {
  dryRun?: boolean
  yes?: boolean
  includeManual?: boolean
  entity?: string
  json?: boolean
}

function registerSync(group: Command): void {
  group
    .command('sync')
    .description('Register automatic charges that are due this month (catch-up)')
    .option('--dry-run', 'preview only; never writes')
    .option('--yes', 'apply without confirmation (required in non-interactive use)')
    .option('--include-manual', 'also process manual charges')
    .option('--entity <entity>', 'limit to entity: personal | spa')
    .option('--json', 'output JSON')
    .action(async (opts: SyncOptions) => {
      const entity = parseEntityFilter(opts.entity)
      const client = await getAuthedClient()
      const interactive = isInteractive() && !opts.json

      const preview = await processDueRecurringCharges(client, {
        includeManual: opts.includeManual,
        entity,
        dryRun: true,
      })
      const would = preview.charges.filter((c) => c.status === 'would_charge')

      let apply = false
      if (!opts.dryRun) {
        if (opts.yes) apply = true
        else if (interactive && would.length > 0) {
          apply = await promptConfirm(`Registrar ${would.length} cargo(s) automático(s) vencido(s)?`)
        }
      }

      if (!apply) {
        if (opts.json) {
          process.stdout.write(JSON.stringify(preview) + '\n')
        } else {
          renderSyncResult(preview, would.length === 0 ? 'Nada pendiente.' : 'Vista previa (usa --yes para aplicar):')
        }
        return
      }

      const result = await processDueRecurringCharges(client, {
        includeManual: opts.includeManual,
        entity,
        dryRun: false,
      })
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        renderSyncResult(result, 'Aplicado:')
      }
    })
}

function renderSyncResult(result: { charges: Array<{ name: string; status: string; amount?: number; account?: string; reason?: string }> }, title: string): void {
  const lines: string[] = [blank(), headerLine(ui.title('SYNC'), ui.dim(title)), blank()]
  if (result.charges.length === 0) {
    lines.push(indent(ui.dim('(nada)')))
  }
  for (const c of result.charges) {
    if (c.status === 'charged') {
      lines.push(indent(`${ui.positive('✓')} ${ui.strong(c.name)} ${ui.dim('→')} ${ui.strong(formatCLP(c.amount ?? 0))} ${ui.dim(c.account ?? '')}`))
    } else if (c.status === 'would_charge') {
      lines.push(indent(`${ui.warn('●')} ${ui.strong(c.name)} ${ui.dim('→')} ${formatCLP(c.amount ?? 0)} ${ui.dim(c.account ?? '')}`))
    } else {
      lines.push(indent(`${ui.dim('·')} ${ui.dim(c.name)} ${ui.dim(`(${c.reason ?? c.status})`)}`))
    }
  }
  lines.push(blank())
  process.stdout.write(lines.join('\n') + '\n')
}

interface DeleteOptions {
  json?: boolean
}

function registerDelete(group: Command): void {
  group
    .command('delete <ref>')
    .description('Delete a recurring charge (by uuid or name substring)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: DeleteOptions) => {
      const client = await getAuthedClient()
      const charge = await resolveCharge(client, ref)
      if (isInteractive() && !opts.json) {
        const ok = await promptConfirm(`¿Eliminar "${charge.name}"?`, false)
        if (!ok) {
          process.stdout.write('cancelado\n')
          return
        }
      }
      await deleteRecurringCharge(client, charge.id)
      if (opts.json) {
        process.stdout.write(JSON.stringify({ deleted: charge.id }) + '\n')
      } else {
        process.stdout.write(`  ${ui.positive('✓')} ${ui.dim('deleted')} ${ui.strong(charge.name)}\n`)
      }
    })
}

// ---------------------------------------------------------------------------

function parseEntityFilter(value: string | undefined): Entity | undefined {
  if (!value || value === 'all') return undefined
  if (value === 'personal' || value === 'spa') return value
  fail(`invalid --entity: ${value}. One of: personal, spa, all`)
}

async function resolveAmount(
  amountArg: string | undefined,
  opts: { usd?: string; rate?: string },
  interactive: boolean,
): Promise<number> {
  if (opts.usd) {
    if (!opts.rate) fail('--rate <clp> is required with --usd')
    const rate = Number(opts.rate)
    if (!Number.isFinite(rate) || rate <= 0) fail(`invalid --rate: ${opts.rate}`)
    return usdToClp(parseUsdAmount(opts.usd), rate)
  }
  if (amountArg) {
    try {
      return parseAmount(amountArg)
    } catch (err) {
      fail((err as Error).message)
    }
  }
  if (interactive) {
    return parseAmount(
      await promptText('Monto (CLP)', {
        validate: (v) => {
          try {
            parseAmount(v)
            return undefined
          } catch (err) {
            return (err as Error).message
          }
        },
      }),
    )
  }
  fail('amount is required (or use --usd with --rate)')
}

export function registerRecurringCommand(program: Command): void {
  const group = program.command('recurring').description('Manage recurring charges')
  registerList(group)
  registerCreate(group)
  registerEdit(group)
  registerPay(group)
  registerSync(group)
  registerDelete(group)
}
