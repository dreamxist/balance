import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import {
  createRecurringCharge,
  deleteRecurringCharge,
  getRecurringStatus,
  listRecurringDetailed,
  payRecurringCharge,
  updateRecurringCharge,
  type CreateRecurringInput,
  type RecurringChargeDetailed,
  type RecurringStatusItem,
  type UpdateRecurringInput,
} from '@balance/core'
import { supabase } from '@/lib/supabase'

export function useRecurringCharges(): UseQueryResult<RecurringChargeDetailed[]> {
  return useQuery({
    queryKey: ['recurring-charges', 'list'],
    queryFn: () => listRecurringDetailed(supabase, { entity: 'personal', includeInactive: true }),
    staleTime: 60_000,
  })
}

export function useRecurringStatus(): UseQueryResult<RecurringStatusItem[]> {
  return useQuery({
    queryKey: ['recurring-charges', 'status'],
    queryFn: () => getRecurringStatus(supabase, { entity: 'personal' }),
    staleTime: 60_000,
  })
}

function useInvalidateRecurring() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['recurring-charges'] })
}

export function useCreateRecurring() {
  const invalidate = useInvalidateRecurring()
  return useMutation({
    mutationFn: (input: CreateRecurringInput) => createRecurringCharge(supabase, input),
    onSuccess: invalidate,
  })
}

export function useUpdateRecurring() {
  const invalidate = useInvalidateRecurring()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecurringInput }) =>
      updateRecurringCharge(supabase, id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteRecurring() {
  const invalidate = useInvalidateRecurring()
  return useMutation({
    mutationFn: (id: string) => deleteRecurringCharge(supabase, id),
    onSuccess: invalidate,
  })
}

export function usePayRecurring() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chargeId: string) => payRecurringCharge(supabase, { chargeId }),
    onSuccess: () => {
      for (const key of ['recurring-charges', 'transactions', 'accounts', 'reconciliation', 'monthly-breakdown']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
