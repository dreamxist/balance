import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function createAccount(supabase: TypedClient, input: {
  name: string
  type: 'asset' | 'liability'
  subtype: 'debit' | 'cash' | 'credit_card' | 'receivable' | 'payable' | 'investment' | 'property'
  entity?: 'personal' | 'spa'
  currency?: string
  balance?: number
  creditLimit?: number | null
  onBudget?: boolean | null
}) {
  const { data, error } = await supabase.rpc('create_account', {
    p_name: input.name,
    p_type: input.type,
    p_subtype: input.subtype,
    p_entity: input.entity ?? 'personal',
    p_currency: input.currency ?? 'CLP',
    p_balance: input.balance ?? 0,
    p_credit_limit: input.creditLimit ?? undefined,
    p_on_budget: input.onBudget ?? undefined,
  })
  if (error) throw error
  return data
}

export async function getAccounts(supabase: TypedClient, options?: {
  includeArchived?: boolean
  entity?: 'personal' | 'spa'
}) {
  let query = supabase.from('accounts').select('*').order('created_at')
  if (!options?.includeArchived) {
    query = query.eq('is_archived', false)
  }
  if (options?.entity) {
    query = query.eq('entity', options.entity)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function archiveAccount(supabase: TypedClient, accountId: string) {
  const { data, error } = await supabase.rpc('archive_account', {
    p_account_id: accountId,
  })
  if (error) throw error
  return data
}

export async function renameAccount(supabase: TypedClient, accountId: string, newName: string) {
  const { data, error } = await supabase.rpc('rename_account', {
    p_account_id: accountId,
    p_new_name: newName,
  })
  if (error) throw error
  return data
}

export async function updateAccountBalance(supabase: TypedClient, accountId: string, newBalance: number) {
  const { data, error } = await supabase.rpc('update_account_balance_manual', {
    p_account_id: accountId,
    p_new_balance: newBalance,
  })
  if (error) throw error
  return data
}
