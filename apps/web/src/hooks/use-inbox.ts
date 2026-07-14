import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  getEmailMovements,
  getUncategorizedTransactions,
  type EmailMovement,
  type UncategorizedTransaction,
} from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useUncategorizedTransactions(): UseQueryResult<UncategorizedTransaction[]> {
  return useQuery({
    queryKey: ['inbox', 'transactions'],
    queryFn: () => getUncategorizedTransactions(supabase),
    staleTime: 30_000,
  })
}

export function useEmailMovements(): UseQueryResult<EmailMovement[]> {
  return useQuery({
    queryKey: ['inbox', 'staging'],
    queryFn: () => getEmailMovements(supabase),
    staleTime: 30_000,
  })
}
