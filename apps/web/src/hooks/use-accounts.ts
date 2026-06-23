import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getAccounts } from '@balance/core'
import { supabase } from '@/lib/supabase'

type Account = Awaited<ReturnType<typeof getAccounts>>[number]

export type { Account }

export function useAccounts(options?: { includeArchived?: boolean; entity?: 'personal' | 'spa' }): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: ['accounts', options?.includeArchived ?? false, options?.entity ?? 'all'],
    queryFn: () => getAccounts(supabase, { includeArchived: options?.includeArchived, entity: options?.entity }),
    staleTime: 30_000,
  })
}
