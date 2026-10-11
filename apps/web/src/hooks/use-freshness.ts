import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getSyncState, getTransactions, syncSourcesStatus, type SyncSourceStatus } from '@balance/core'
import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/hooks/use-transactions'

export function useSyncStatus(): UseQueryResult<SyncSourceStatus[]> {
  return useQuery({
    queryKey: ['sync-state'],
    queryFn: async () => syncSourcesStatus(await getSyncState(supabase)),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useRecentTransactions(limit: number): UseQueryResult<Transaction[]> {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => getTransactions(supabase, { limit }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
