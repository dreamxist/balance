import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function createTransaction(supabase: TypedClient, input: {
  amount: number
  category: string
  accountId: string
  description: string
  type?: 'income' | 'expense' | 'refund' | 'adjustment'
  date?: string
}) {
  const { data, error } = await supabase.rpc('create_transaction', {
    p_amount: input.amount,
    p_category: input.category,
    p_account_id: input.accountId,
    p_description: input.description,
    p_type: input.type ?? undefined,
    p_date: input.date ?? undefined,
  })
  if (error) throw error
  return data
}

export async function undoTransaction(supabase: TypedClient, transactionId: string) {
  const { data, error } = await supabase.rpc('undo_transaction', {
    p_transaction_id: transactionId,
  })
  if (error) throw error
  return data
}

export async function createOpeningBalance(supabase: TypedClient, accountId: string) {
  const { data, error } = await supabase.rpc('create_opening_balance', {
    p_account_id: accountId,
  })
  if (error) throw error
  return data
}

export async function getTransactions(supabase: TypedClient, options?: {
  accountId?: string
  category?: string
  type?: string
  types?: string[]
  month?: string
  search?: string
  limit?: number
  offset?: number
}) {
  let query = supabase.from('transactions').select('*').order('date', { ascending: false })
  if (options?.accountId) query = query.eq('account_id', options.accountId)
  if (options?.category) query = query.ilike('category', `${options.category}%`)
  if (options?.types && options.types.length > 0) {
    query = query.in('type', options.types as ('income' | 'expense' | 'refund' | 'transfer' | 'debt_payment' | 'adjustment')[])
  } else if (options?.type) {
    query = query.eq('type', options.type as 'income' | 'expense' | 'refund' | 'transfer' | 'debt_payment' | 'adjustment')
  }
  if (options?.search) query = query.ilike('description', `%${options.search}%`)
  if (options?.month) {
    const start = `${options.month}-01`
    const year = Number(options.month.split('-')[0])
    const month = Number(options.month.split('-')[1])
    const end = new Date(year, month, 0).toISOString().split('T')[0]
    query = query.gte('date', start).lte('date', end)
  }
  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset) query = query.range(options.offset, options.offset + (options?.limit ?? 50) - 1)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getMonthlySummary(supabase: TypedClient, month: string) {
  const startDate = `${month}-01`
  const parts = month.split('-')
  const year = Number(parts[0])
  const mon = Number(parts[1])
  const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('monthly_summary')
    .select('*')
    .gte('month', startDate)
    .lte('month', `${endDate}T23:59:59`)
    .eq('entity', 'personal')
  if (error) throw error

  const totals = {
    income: 0,
    expenses: 0,
    net: 0,
    txCount: 0,
  }
  for (const row of data ?? []) {
    totals.income += Number(row.income ?? 0)
    totals.expenses += Number(row.expenses ?? 0)
    totals.net += Number(row.net ?? 0)
    totals.txCount += Number(row.tx_count ?? 0)
  }
  return totals
}
