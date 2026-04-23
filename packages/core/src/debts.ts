import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function createInstallmentPurchase(supabase: TypedClient, input: {
  amount: number
  installments: number
  category: string
  accountId: string
  description: string
  date?: string
  firstPaymentDate?: string
}) {
  const { data, error } = await supabase.rpc('create_installment_purchase', {
    p_amount: input.amount,
    p_installments: input.installments,
    p_category: input.category,
    p_account_id: input.accountId,
    p_description: input.description,
    p_date: input.date ?? undefined,
    p_first_payment_date: input.firstPaymentDate ?? undefined,
  })
  if (error) throw error
  return data
}

export async function payDebtInstallment(supabase: TypedClient, debtId: string, date?: string) {
  const { data, error } = await supabase.rpc('pay_debt_installment', {
    p_debt_id: debtId,
    p_date: date ?? undefined,
  })
  if (error) throw error
  return data
}

export async function payOffDebt(supabase: TypedClient, debtId: string, actualAmount?: number) {
  const { data, error } = await supabase.rpc('pay_off_debt', {
    p_debt_id: debtId,
    p_actual_amount: actualAmount ?? undefined,
  })
  if (error) throw error
  return data
}

export async function getActiveDebts(supabase: TypedClient) {
  const { data, error } = await supabase.from('active_debts').select('*')
  if (error) throw error
  return data
}

export async function archiveDebt(supabase: TypedClient, debtId: string) {
  const { data, error } = await supabase.rpc('archive_debt', {
    p_debt_id: debtId,
  })
  if (error) throw error
  return data
}
