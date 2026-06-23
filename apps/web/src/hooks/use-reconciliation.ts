import { useQuery } from '@tanstack/react-query'
import { getReconciliationStatus } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useReconciliation() {
  return useQuery({
    queryKey: ['reconciliation', 'personal'],
    queryFn: () => getReconciliationStatus(supabase, 'personal'),
    staleTime: 30_000,
  })
}
