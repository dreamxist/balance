import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getActiveDebts } from '@balance/core'
import { supabase } from '@/lib/supabase'

type RawDebt = Awaited<ReturnType<typeof getActiveDebts>>[number]

type Debt = RawDebt & {
  id: string
  installments: number
  installments_paid: number
  total_amount: number
  installment_amount: number
  account_name: string
  remaining_installments: number
  account_id: string
  description: string
  remaining_amount: number
  next_payment_date: string | null
  last_installment_amount: number
}

export type { Debt }

export function useDebts(): UseQueryResult<Debt[]> {
  return useQuery({
    queryKey: ['debts'],
    queryFn: () => getActiveDebts(supabase) as Promise<Debt[]>,
    staleTime: 30_000,
  })
}
