import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

export type OnboardingAccount = {
  name: string
  type: 'asset' | 'liability'
  subtype: 'debit' | 'cash' | 'credit_card' | 'receivable' | 'payable'
  balance: number
  creditLimit?: number
}

export type OnboardingInput = {
  accounts: OnboardingAccount[]
  profile?: {
    displayName?: string
    features?: {
      spa?: boolean
      investments?: boolean
      rentals?: boolean
      taxes?: boolean
    }
  }
}

export async function completeOnboarding(supabase: TypedClient, input: OnboardingInput) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not yet in generated types
  const { data, error } = await (supabase.rpc as (fn: string, params: Record<string, unknown>) => ReturnType<typeof supabase.rpc>)('complete_onboarding', {
    p_data: {
      accounts: input.accounts.map((a) => ({
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        balance: a.balance,
        credit_limit: a.creditLimit ?? null,
      })),
      profile: {
        display_name: input.profile?.displayName ?? null,
        features: input.profile?.features ?? {},
      },
    },
  })
  if (error) throw error
  return data as { accounts_created: number; is_onboarded: boolean }
}

export async function getOnboardingStatus(supabase: TypedClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_onboarded')
    .single()
  if (error) throw error
  return { isOnboarded: (data as { is_onboarded: boolean }).is_onboarded }
}
