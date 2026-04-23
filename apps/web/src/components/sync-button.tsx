import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface DailyChargesResult {
  date: string
  day: number
  processed: number
  results: string[]
}

interface SyncButtonProps {
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
}

export function SyncButton({ size = 'sm', variant = 'outline', className }: SyncButtonProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (): Promise<DailyChargesResult> => {
      const { data, error } = await supabase.functions.invoke('daily-charges', {
        body: {},
      })
      if (error) throw error
      return data as DailyChargesResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['recurring-charges'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-breakdown'] })

      if (data.processed === 0) {
        toast.info('Nada nuevo para cobrar hoy')
        return
      }

      toast.success(`${data.processed} movimiento(s) procesado(s)`, {
        description: data.results.slice(0, 4).join(' · '),
        duration: 6000,
      })
    },
    onError: (e: Error) => {
      toast.error(`Sync error: ${e.message}`)
    },
  })

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className={className}
      title="Cobrar cargos recurrentes y cuotas de deuda pendientes"
    >
      {mutation.isPending ? 'Sincronizando...' : '↻ Sync'}
    </Button>
  )
}
