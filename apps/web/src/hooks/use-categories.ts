import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getCategories } from '@balance/core'
import { supabase } from '@/lib/supabase'

type Category = Awaited<ReturnType<typeof getCategories>>[number]

export type { Category }

export function useCategories(options?: { entity?: 'personal' | 'spa' }): UseQueryResult<Category[]> {
  return useQuery({
    queryKey: ['categories', options?.entity],
    queryFn: () => getCategories(supabase, { entity: options?.entity }),
    staleTime: 60_000,
  })
}
