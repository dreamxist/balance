import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import type { Entity } from './recurring'
import { normalizeMonth } from './buckets'

type TypedClient = SupabaseClient<Database>

export const BUDGET_BUCKETS = ['necesidades', 'consumo', 'ahorro'] as const
export type BudgetBucket = (typeof BUDGET_BUCKETS)[number]

export function isBudgetBucket(value: unknown): value is BudgetBucket {
  return typeof value === 'string' && (BUDGET_BUCKETS as readonly string[]).includes(value)
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface BucketBudgetDay {
  date: string
  /** Cumulative spend of the bucket up to this day. */
  spent: number
}

export interface BucketBudgetLine {
  bucket: BudgetBucket
  /** null when no budget was ever set for the bucket. */
  budget: number | null
  spent: number
  remaining: number | null
  daily: BucketBudgetDay[]
}

export interface BucketBudgets {
  month: string
  buckets: BucketBudgetLine[]
}

export interface BucketBudgetsOptions {
  /** 'YYYY-MM' or 'YYYY-MM-DD'; default: current month (resolved in DB) */
  month?: string
  entity?: Entity
}

export async function getBucketBudgets(
  supabase: TypedClient,
  options: BucketBudgetsOptions = {},
): Promise<BucketBudgets> {
  const args: { p_month?: string; p_entity?: Entity } = {}
  if (options.month !== undefined) args.p_month = normalizeMonth(options.month)
  if (options.entity !== undefined) args.p_entity = options.entity

  const { data, error } = await supabase.rpc('get_bucket_budgets', args)
  if (error) throw error
  return data as unknown as BucketBudgets
}

export interface SetBucketBudgetInput {
  bucket: BudgetBucket
  /** Integer CLP. */
  amount: number
  /** 'YYYY-MM' or 'YYYY-MM-01'; the budget applies from this month on. */
  month: string
  entity?: Entity
}

export type BucketBudgetRow = Database['public']['Tables']['bucket_budgets']['Row']

export async function setBucketBudget(
  supabase: TypedClient,
  input: SetBucketBudgetInput,
): Promise<BucketBudgetRow> {
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw new Error(`Invalid amount ${input.amount}: must be a non-negative integer`)
  }
  const month = normalizeMonth(input.month)
  if (!month.endsWith('-01')) throw new Error(`Invalid month "${input.month}": use the first day of the month`)

  const { data, error } = await supabase
    .from('bucket_budgets')
    .upsert(
      { entity: input.entity ?? 'personal', bucket: input.bucket, month, amount: input.amount },
      { onConflict: 'user_id,entity,bucket,month' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}
