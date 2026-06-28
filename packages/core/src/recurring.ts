import type { SupabaseClient as UntypedClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export type Entity = 'personal' | 'spa'
export type RecurringStatus = 'charged' | 'due' | 'upcoming'

export interface RecurringChargeDetailed {
  id: string
  name: string
  amount: number
  currency: string
  day_of_month: number
  category: string
  account_id: string
  account_name: string
  entity: Entity
  subtype: string
  is_active: boolean
  auto_charge: boolean
  last_charged_on: string | null
}

export interface RecurringStatusItem {
  id: string
  name: string
  amount: number
  currency: string
  day_of_month: number
  category: string
  account_id: string
  account_name: string
  entity: Entity
  subtype: string
  auto_charge: boolean
  last_charged_on: string | null
  due_date: string
  status: RecurringStatus
}

export interface ProcessedCharge {
  id: string
  name: string
  status: 'charged' | 'skipped' | 'would_charge'
  reason?: string
  amount?: number
  transaction_id?: string
  auto_charge?: boolean
  account?: string
  due_date?: string
}

export interface ProcessResult {
  as_of: string
  dry_run: boolean
  charges: ProcessedCharge[]
}

export interface CreateRecurringInput {
  name: string
  amount: number
  dayOfMonth: number
  category: string
  accountId: string
  currency?: string
  autoCharge?: boolean
}

export interface UpdateRecurringInput {
  name?: string
  amount?: number
  dayOfMonth?: number
  category?: string
  accountId?: string
  autoCharge?: boolean
  isActive?: boolean
}

// New columns (auto_charge, last_charged_on) and the detailed view are not in
// the generated types until regenerated, so reach these through an untyped
// client (same pattern as reconciliation.ts).
function untyped(supabase: TypedClient): UntypedClient {
  return supabase as unknown as UntypedClient
}

export async function getRecurringStatus(
  supabase: TypedClient,
  opts?: { asOf?: string; entity?: Entity },
): Promise<RecurringStatusItem[]> {
  const args: Record<string, unknown> = {}
  if (opts?.asOf) args.p_as_of = opts.asOf
  if (opts?.entity) args.p_entity = opts.entity
  const { data, error } = await untyped(supabase).rpc('get_recurring_status', args)
  if (error) throw error
  return (data ?? []) as RecurringStatusItem[]
}

export async function processDueRecurringCharges(
  supabase: TypedClient,
  opts?: { asOf?: string; includeManual?: boolean; dryRun?: boolean; entity?: Entity },
): Promise<ProcessResult> {
  const args: Record<string, unknown> = {}
  if (opts?.asOf) args.p_as_of = opts.asOf
  if (opts?.includeManual !== undefined) args.p_include_manual = opts.includeManual
  if (opts?.dryRun !== undefined) args.p_dry_run = opts.dryRun
  if (opts?.entity) args.p_entity = opts.entity
  // p_user_id intentionally omitted — derived from the caller's auth.uid().
  const { data, error } = await untyped(supabase).rpc('process_due_recurring_charges', args)
  if (error) throw error
  return data as ProcessResult
}

export async function payRecurringCharge(
  supabase: TypedClient,
  opts: { chargeId: string; date?: string; amount?: number },
): Promise<ProcessedCharge> {
  const args: Record<string, unknown> = { p_charge_id: opts.chargeId }
  if (opts.date) args.p_date = opts.date
  if (opts.amount !== undefined) args.p_amount = opts.amount
  const { data, error } = await untyped(supabase).rpc('pay_recurring_charge', args)
  if (error) throw error
  return data as ProcessedCharge
}

export async function listRecurringDetailed(
  supabase: TypedClient,
  opts?: { entity?: Entity; includeInactive?: boolean },
): Promise<RecurringChargeDetailed[]> {
  let query = untyped(supabase)
    .from('recurring_charges_detailed')
    .select('*')
    .order('day_of_month')
  if (!opts?.includeInactive) query = query.eq('is_active', true)
  if (opts?.entity) query = query.eq('entity', opts.entity)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as RecurringChargeDetailed[]
}

export async function createRecurringCharge(
  supabase: TypedClient,
  input: CreateRecurringInput,
): Promise<RecurringChargeDetailed> {
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) throw new Error('Could not resolve authenticated user')

  const { data, error } = await untyped(supabase)
    .from('recurring_charges')
    .insert({
      name: input.name,
      amount: input.amount,
      day_of_month: input.dayOfMonth,
      category: input.category,
      account_id: input.accountId,
      currency: input.currency ?? 'CLP',
      auto_charge: input.autoCharge ?? true,
      user_id: userData.user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data as RecurringChargeDetailed
}

export async function updateRecurringCharge(
  supabase: TypedClient,
  id: string,
  input: UpdateRecurringInput,
): Promise<RecurringChargeDetailed> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name
  if (input.amount !== undefined) patch.amount = input.amount
  if (input.dayOfMonth !== undefined) patch.day_of_month = input.dayOfMonth
  if (input.category !== undefined) patch.category = input.category
  if (input.accountId !== undefined) patch.account_id = input.accountId
  if (input.autoCharge !== undefined) patch.auto_charge = input.autoCharge
  if (input.isActive !== undefined) patch.is_active = input.isActive

  const { data, error } = await untyped(supabase)
    .from('recurring_charges')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as RecurringChargeDetailed
}

export async function deleteRecurringCharge(supabase: TypedClient, id: string): Promise<void> {
  const { error } = await untyped(supabase).from('recurring_charges').delete().eq('id', id)
  if (error) throw error
}
