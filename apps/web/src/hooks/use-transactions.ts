import { useInfiniteQuery, type UseInfiniteQueryResult } from '@tanstack/react-query'
import { getTransactions } from '@balance/core'
import { supabase } from '@/lib/supabase'
import type { Database } from '@balance/core'

export interface TransactionFilters {
  month?: string
  category?: string
  accountId?: string
  type?: string
  search?: string
}

export type Transaction = Database['public']['Tables']['transactions']['Row']

const PAGE_SIZE = 50

type TransactionType = 'income' | 'expense' | 'refund' | 'transfer' | 'debt_payment' | 'adjustment'

export function useTransactions(filters: TransactionFilters): UseInfiniteQueryResult<{ pages: Transaction[][]; pageParams: number[] }> {
  return useInfiniteQuery({
    queryKey: ['transactions', filters],
    queryFn: ({ pageParam }) => {
      const opts: Parameters<typeof getTransactions>[1] = {
        accountId: filters.accountId,
        category: filters.category,
        search: filters.search,
        month: filters.month,
        limit: PAGE_SIZE,
        offset: pageParam,
      }
      if (filters.type === 'internal') {
        opts.types = ['transfer', 'debt_payment', 'adjustment']
      } else if (filters.type) {
        opts.type = filters.type
      }
      return getTransactions(supabase, opts)
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
    staleTime: 30_000,
  })
}
