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

/**
 * Aggregates income/expense/refund for a given month into the dashboard buckets.
 * Filtered by `entity` so personal and SpA flows never bleed into each other.
 * `delta` here is just income - spent (the "available this month" figure), not
 * the reconciliation delta.
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

  let query = supabase
    .from('transactions')
    .select('type, amount, category')
    .gte('date', start)
    .lte('date', end)
    .in('type', ['income', 'expense', 'refund'])
  if (options.entity) query = query.eq('entity', options.entity)

  const { data, error } = await query
  if (error) throw error

  let income = 0
  let necesidades = 0
  let consumo = 0
  let ahorro = 0

  for (const tx of data ?? []) {
    const amt = tx.amount ?? 0
    if (tx.type === 'income') {
      income += amt
      continue
    }
    // expense or refund: refund is money coming back, so it reduces the bucket.
    const signed = tx.type === 'refund' ? -amt : amt
    const root = categoryRoot(tx.category)
    if (root === 'necesidad') necesidades += signed
    else if (root === 'ahorro') ahorro += signed
    else consumo += signed // consumo + any unmapped expense
  }

  const delta = income - (necesidades + consumo + ahorro)
  return { income, necesidades, consumo, ahorro, delta }
}
