import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export type UncategorizedTransaction = Database['public']['Tables']['transactions']['Row']
export type EmailMovement = Database['public']['Tables']['email_movements']['Row']
export type CategorizationRule = Database['public']['Tables']['categorization_rules']['Row']

/** Transactions awaiting a category (NULL), newest first. */
export async function getUncategorizedTransactions(
  supabase: TypedClient,
): Promise<UncategorizedTransaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .is('category', null)
    .in('type', ['income', 'expense', 'refund'])
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Staging rows still needing attention (pending USD, parse errors). */
export async function getEmailMovements(
  supabase: TypedClient,
  statuses: Array<'pending' | 'error'> = ['pending', 'error'],
): Promise<EmailMovement[]> {
  const { data, error } = await supabase
    .from('email_movements')
    .select('*')
    .in('status', statuses)
    .order('email_date', { ascending: false })
  if (error) throw error
  return data
}

/** The only permitted transaction mutation: assign/correct its category. */
export async function setTransactionCategory(
  supabase: TypedClient,
  transactionId: string,
  category: string,
) {
  const { data, error } = await supabase.rpc('set_transaction_category', {
    p_transaction_id: transactionId,
    p_category: category,
  })
  if (error) throw error
  return data
}

export async function getCategorizationRules(
  supabase: TypedClient,
): Promise<CategorizationRule[]> {
  const { data, error } = await supabase
    .from('categorization_rules')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at')
  if (error) throw error
  return data
}

export async function createCategorizationRule(
  supabase: TypedClient,
  input: { pattern: string; category: string; priority?: number },
): Promise<CategorizationRule> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')
  const { data, error } = await supabase
    .from('categorization_rules')
    .insert({
      user_id: userData.user.id,
      pattern: input.pattern,
      category: input.category,
      priority: input.priority ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCategorizationRule(
  supabase: TypedClient,
  ruleId: string,
): Promise<void> {
  const { error } = await supabase.from('categorization_rules').delete().eq('id', ruleId)
  if (error) throw error
}

export interface PromoteSummary {
  promoted: number
  skipped_existing: number
  pending: number
  errors: number
}

/**
 * Promote pending email movements into transactions. With a user JWT the RPC
 * scopes to the caller; p_usd_rate converts staged USD purchases (CLP per USD).
 */
export async function promoteEmailMovements(
  supabase: TypedClient,
  options: { usdRate?: number } = {},
): Promise<PromoteSummary> {
  const { data, error } = await supabase.rpc('promote_email_movements', {
    p_usd_rate: options.usdRate,
  })
  if (error) throw error
  return data as unknown as PromoteSummary
}

export interface SyncState {
  user_id: string
  gmail_watermark: string | null
  updated_at: string
}

/** Last successful gmail-sync watermark for the caller, or null if never synced. */
export async function getSyncState(supabase: TypedClient): Promise<SyncState | null> {
  const { data, error } = await supabase.from('sync_state').select('*').maybeSingle()
  if (error) throw error
  return data
}

/** Discard a staging row that should never become a transaction. */
export async function discardEmailMovement(
  supabase: TypedClient,
  movementId: string,
): Promise<void> {
  const { error } = await supabase
    .from('email_movements')
    .update({ status: 'discarded' })
    .eq('id', movementId)
  if (error) throw error
}
