import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface RecurringCharge {
  id: string
  name: string
  amount: number
  currency: string
  day_of_month: number
  category: string
  account_id: string
  is_active: boolean
}

export type { RecurringCharge }

export function useRecurringCharges(): UseQueryResult<RecurringCharge[]> {
  return useQuery({
    queryKey: ['recurring-charges'],
    queryFn: async () => {
      const { data, error } = await db
        .from('recurring_charges')
        .select('*')
        .order('day_of_month')
      if (error) throw error
      return data as unknown as RecurringCharge[]
    },
    staleTime: 60_000,
  })
}

export function useCreateRecurring() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<RecurringCharge, 'id' | 'is_active' | 'currency'>) => {
      const { error } = await db.from('recurring_charges').insert({
        name: input.name,
        amount: input.amount,
        day_of_month: input.day_of_month,
        category: input.category,
        account_id: input.account_id,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-charges'] }),
  })
}

export function useDeleteRecurring() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('recurring_charges').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-charges'] }),
  })
}
