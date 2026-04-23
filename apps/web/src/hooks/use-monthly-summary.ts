import { useQuery } from '@tanstack/react-query'
import { getMonthlySummary } from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useMonthlySummary(month: string) {
  return useQuery({
    queryKey: ['monthly-summary', month],
    queryFn: () => getMonthlySummary(supabase, month),
    staleTime: 30_000,
    enabled: !!month,
  })
}
