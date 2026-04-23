import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { updateAccountBalance } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/format'

interface UpdateBalanceVars {
  accountId: string
  newBalance: number
  previousBalance: number
  accountName: string
}

export function useUpdateBalance(): UseMutationResult<unknown, Error, UpdateBalanceVars> {
  const queryClient = useQueryClient()

  const invalidateRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }

  return useMutation({
    mutationFn: (vars: UpdateBalanceVars) =>
      updateAccountBalance(supabase, vars.accountId, vars.newBalance),
    onSuccess: (_result, variables) => {
      invalidateRelated()
      toast.success(`${variables.accountName}: ${formatMoney(variables.newBalance)}`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await updateAccountBalance(supabase, variables.accountId, variables.previousBalance)
            invalidateRelated()
            toast.info('Balance restaurado')
          },
        },
        duration: 5000,
      })
    },
    onError: () => {
      toast.error('Error al actualizar balance')
    },
  })
}
