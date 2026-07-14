import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getMonthlyBuckets, type MonthlyBuckets } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useMonthlyBreakdown(): UseQueryResult<MonthlyBuckets> {
  return useQuery({
    queryKey: ['monthly-breakdown'],
    queryFn: () => getMonthlyBuckets(supabase),
    staleTime: 30_000,
  })
}
