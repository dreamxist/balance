import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getAccounts } from '@balance/core'
import { supabase } from '@/lib/supabase'

type Account = Awaited<ReturnType<typeof getAccounts>>[number]

export type { Account }

export function useAccounts(options?: { includeArchived?: boolean }): UseQueryResult<Account[]> {
  return useQuery({
    queryKey: ['accounts', options?.includeArchived ?? false],
    queryFn: () => getAccounts(supabase, { includeArchived: options?.includeArchived }),
    staleTime: 30_000,
  })
}
