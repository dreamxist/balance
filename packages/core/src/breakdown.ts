import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export type CategoryRoot = 'necesidad' | 'consumo' | 'ahorro' | 'ingreso' | 'other'

// Legacy free-text categories entered before the category tree was enforced.
// They have no parent in the `categories` table, so map them by hand.
const LEGACY_CATEGORY_ROOTS: Record<string, CategoryRoot> = {
  necesidades: 'necesidad',
  supermercado: 'necesidad',
  salud: 'necesidad',
  transporte: 'necesidad',
  bencina: 'necesidad',
  servicios: 'necesidad',
  'pago-cuentas': 'necesidad',
  comida: 'consumo',
  entretenimiento: 'consumo',
  'sin-detallar': 'consumo',
  sueldo: 'ingreso',
  honorarios: 'ingreso',
  arriendo: 'ingreso',
  facturacion: 'ingreso',
}

// Categories that represent money *moving* or *being settled*, not real monthly
// income or spending. They are excluded from the breakdown so they don't distort
// the "available this month" figure:
//   - pago-cuentas / pago-tarjeta: paying off a card/bill (the spend already
//     happened at purchase time; paying it just moves money / reduces debt).
//   - cobro / reembolso: collecting money owed to you (a receivable), recorded
//     as income+expense that nets to zero — pure bookkeeping, not a flow.
//   - movimiento / reserva: moving your own money between accounts (e.g. to a
//     savings reserve). This is a transfer in disguise.
//   - apertura / ajuste: opening balances and reconciliation tweaks.
const NON_FLOW_CATEGORIES = new Set([
  'pago-cuentas',
  'pago-tarjeta',
  'cobro',
  'reembolso',
  'apertura',
  'ajuste',
  'movimiento',
  'reserva',
])

/**
 * Resolves a transaction category (either a dotted tree id like `necesidad.salud`
 * or a legacy free-text string like `comida`) to its top-level group.
 */
export function categoryRoot(category: string | null | undefined): CategoryRoot {
  const cat = (category ?? '').toLowerCase().trim()
  if (!cat) return 'other'
  const head = cat.split('.')[0] ?? cat
  if (head === 'necesidad') return 'necesidad'
  if (head === 'consumo') return 'consumo'
  if (head === 'ahorro') return 'ahorro'
  if (head === 'ingreso') return 'ingreso'
  return LEGACY_CATEGORY_ROOTS[cat] ?? LEGACY_CATEGORY_ROOTS[head] ?? 'other'
}

export interface MonthlyBreakdown {
  income: number
  necesidades: number
  consumo: number
  ahorro: number
  delta: number
}

export interface BreakdownRow {
  type: string | null
  amount: number | null
  category: string | null
  description: string | null
}

/**
 * Aggregates a month's transactions into the dashboard buckets. Pure function so
 * the (fiddly) bucketing rules can be unit-tested without a database.
 *
 * Rules:
 *  - Only income/expense/refund count as flows; transfers and debt_payments are
 *    excluded by the caller's query (they move money, they don't consume/earn it).
 *  - `adjustment` rows are normally ignored, EXCEPT undo reversals (description
 *    starts with "Undo:"), which are netted back out of their bucket so an
 *    expense you undid stops inflating Consumo/Necesidades.
 *  - NON_FLOW_CATEGORIES (card payments, collections, account movements, …) are
 *    dropped entirely — they are bookkeeping, not real income or spending.
 *  - Income filed under an `ahorro` category is a movement (cash deposited into
 *    an account), not earnings, so it does not count as income.
 *  - `delta` is "available this month" = income − (necesidades + consumo).
 *    Ahorro is shown separately, not subtracted: it's an allocation of income,
 *    not a loss.
 */
export function aggregateBreakdown(rows: BreakdownRow[]): MonthlyBreakdown {
  let income = 0
  let necesidades = 0
  let consumo = 0
  let ahorro = 0

  for (const tx of rows) {
    const amt = tx.amount ?? 0
    const cat = (tx.category ?? '').toLowerCase().trim()
    const root = categoryRoot(tx.category)

    if (tx.type === 'adjustment') {
      // Only undo reversals participate; every other adjustment is non-flow.
      if (!(tx.description ?? '').startsWith('Undo:')) continue
      if (NON_FLOW_CATEGORIES.has(cat)) continue
      // The reversal carries the original's category and an inverse-signed amount,
      // so adding/subtracting it by bucket cancels the original entry.
      if (root === 'ingreso') income += amt
      else if (root === 'necesidad') necesidades -= amt
      else if (root === 'ahorro') ahorro -= amt
      else consumo -= amt
      continue
    }

    if (NON_FLOW_CATEGORIES.has(cat)) continue

    if (tx.type === 'income') {
      if (root === 'ahorro') continue // cash moved into an account, not earnings
      income += amt
      continue
    }

    // expense or refund: refund is money coming back, so it reduces the bucket.
    const signed = tx.type === 'refund' ? -amt : amt
    if (root === 'necesidad') necesidades += signed
    else if (root === 'ahorro') ahorro += signed
    else consumo += signed // consumo + any unmapped expense
  }

  const delta = income - (necesidades + consumo)
  return { income, necesidades, consumo, ahorro, delta }
}

/**
 * Aggregates income/expense/refund for a given month into the dashboard buckets.
 * Filtered by `entity` so personal and SpA flows never bleed into each other.
 */
export async function getMonthlyBreakdown(
  supabase: TypedClient,
  options: { month: string; entity?: 'personal' | 'spa' },
): Promise<MonthlyBreakdown> {
  const parts = options.month.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const start = `${options.month}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // `adjustment` is included so undo reversals can be netted out; transfers and
  // debt_payments stay excluded (they move money, they don't earn/consume it).
  let query = supabase
    .from('transactions')
    .select('type, amount, category, description')
    .gte('date', start)
    .lte('date', end)
    .in('type', ['income', 'expense', 'refund', 'adjustment'])
  if (options.entity) query = query.eq('entity', options.entity)

  const { data, error } = await query
  if (error) throw error

  return aggregateBreakdown(data ?? [])
}
