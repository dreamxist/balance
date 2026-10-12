import type { SupabaseClient as UntypedClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export interface UnmappedWalletCard {
  card: string
  payments: number
  total: number
  lastAt: string | null
}

export interface LinkWalletCardResult {
  card: string
  account: string
  booked: number
}

// link_wallet_card and the apple_pay source are newer than the generated
// types; reach them untyped (same pattern as recurring.ts).
function untyped(supabase: TypedClient): UntypedClient {
  return supabase as unknown as UntypedClient
}

/** Apple Pay payments waiting for their Wallet card to be mapped, by card. */
export async function getUnmappedWalletCards(supabase: TypedClient): Promise<UnmappedWalletCard[]> {
  const { data, error } = await untyped(supabase)
    .from('email_movements')
    .select('account_hint, amount, email_date')
    .eq('source', 'apple_pay')
    .eq('status', 'error')
  if (error) throw error
  const byCard = new Map<string, UnmappedWalletCard>()
  for (const row of (data ?? []) as Array<{ account_hint: string | null; amount: number | null; email_date: string | null }>) {
    const card = row.account_hint ?? ''
    const entry = byCard.get(card) ?? { card, payments: 0, total: 0, lastAt: null }
    entry.payments += 1
    entry.total += row.amount ?? 0
    if (row.email_date && (!entry.lastAt || row.email_date > entry.lastAt)) entry.lastAt = row.email_date
    byCard.set(card, entry)
  }
  return [...byCard.values()].sort((a, b) => b.payments - a.payments)
}

/** Map a Wallet card name to an account and book its pending payments. */
export async function linkWalletCard(
  supabase: TypedClient,
  card: string,
  accountId: string,
): Promise<LinkWalletCardResult> {
  const { data, error } = await untyped(supabase).rpc('link_wallet_card', {
    p_card: card,
    p_account_id: accountId,
  })
  if (error) throw error
  return data as LinkWalletCardResult
}
