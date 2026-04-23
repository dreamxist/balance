import { useQuery } from '@tanstack/react-query'
import { getReconciliationStatus } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useReconciliation() {
  return useQuery({
    queryKey: ['reconciliation'],
    queryFn: () => getReconciliationStatus(supabase),
    staleTime: 30_000,
  })
}
