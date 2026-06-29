import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getMonthlyBreakdown, type MonthlyBreakdown } from '@balance/core'
import { supabase } from '@/lib/supabase'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function useMonthlyBreakdown(month?: string): UseQueryResult<MonthlyBreakdown> {
  const targetMonth = month ?? currentMonth()
  return useQuery({
    queryKey: ['monthly-breakdown', targetMonth],
    queryFn: () => getMonthlyBreakdown(supabase, { month: targetMonth, entity: 'personal' }),
    staleTime: 30_000,
  })
}
