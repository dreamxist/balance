import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import type { Entity } from './recurring'

type TypedClient = SupabaseClient<Database>

export interface MonthlyBuckets {
  income: number
  necesidades: number
  consumo: number
  ahorro: number
  por_categorizar: number
  disponible: number
  month: string
}

export interface MonthlyBucketsOptions {
  /** 'YYYY-MM' or 'YYYY-MM-DD'; default: current month (resolved in DB) */
  month?: string
  entity?: Entity
}

function normalizeMonth(month: string): string {
  if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return month
  throw new Error(`Invalid month "${month}", expected YYYY-MM or YYYY-MM-DD`)
}

export async function getMonthlyBuckets(
  supabase: TypedClient,
  options: MonthlyBucketsOptions = {},
): Promise<MonthlyBuckets> {
  const args: { p_month?: string; p_entity?: Entity } = {}
  if (options.month !== undefined) args.p_month = normalizeMonth(options.month)
  if (options.entity !== undefined) args.p_entity = options.entity

  const { data, error } = await supabase.rpc('get_monthly_buckets', args)
  if (error) throw error
  return data as unknown as MonthlyBuckets
}
