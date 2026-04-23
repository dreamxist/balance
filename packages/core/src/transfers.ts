import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export async function createTransfer(supabase: TypedClient, input: {
  fromAccountId: string
  toAccountId: string
  amount: number
  description: string
  date?: string
}) {
  const { data, error } = await supabase.rpc('create_transfer', {
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount: input.amount,
    p_description: input.description,
    p_date: input.date ?? undefined,
  })
  if (error) throw error
  return data
}

export async function createInterEntityTransfer(supabase: TypedClient, input: {
  fromAccountId: string
  toAccountId: string
  amount: number
  description: string
  date?: string
}) {
  const { data, error } = await supabase.rpc('create_inter_entity_transfer', {
    p_from_account_id: input.fromAccountId,
    p_to_account_id: input.toAccountId,
    p_amount: input.amount,
    p_description: input.description,
    p_date: input.date ?? undefined,
  })
  if (error) throw error
  return data
}

export async function receivePayment(supabase: TypedClient, input: {
  receivableId: string
  destinationId: string
  amount: number
  description: string
  date?: string
}) {
  const { data, error } = await supabase.rpc('receive_payment', {
    p_receivable_id: input.receivableId,
    p_destination_id: input.destinationId,
    p_amount: input.amount,
    p_description: input.description,
    p_date: input.date ?? undefined,
  })
  if (error) throw error
  return data
}
