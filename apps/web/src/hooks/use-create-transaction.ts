import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { createTransaction, undoTransaction } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/format'

interface CreateTransactionInput {
  amount: number
  category: string
  accountId: string
  description: string
  type?: 'income' | 'expense' | 'refund' | 'adjustment'
  date?: string
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useCreateTransaction(): UseMutationResult<unknown, Error, CreateTransactionInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      createTransaction(supabase, input),
    onSuccess: (data, variables) => {
      const result = data as { id: string }

      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })

      toast.success(`Movimiento registrado (${formatMoney(variables.amount)})`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await undoTransaction(supabase, result.id)
            queryClient.invalidateQueries({ queryKey: ['transactions'] })
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
            toast.info('Movimiento deshecho')
          },
        },
        duration: 5000,
      })
    },
    onError: () => {
      toast.error('Error al registrar movimiento')
    },
  })
}
