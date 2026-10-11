import { useMutation, useQueryClient } from '@tanstack/react-query'
import { triggerFintocSync, triggerGmailSync } from '@balance/core'
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

interface SyncOutcome {
  promoted: number
  pending: number
  charges: DailyChargesResult | null
  errors: string[]
}

function errorText(source: string, reason: unknown): string {
  return `${source}: ${reason instanceof Error ? reason.message : String(reason)}`
}

// Each source runs on its own, like `bal sync`: a broken Gmail OAuth must not
// stop the bank feed or the recurring charges.
async function runSync(): Promise<SyncOutcome> {
  const errors: string[] = []
  let promoted = 0
  let pending = 0

  try {
    const gmail = await triggerGmailSync(supabase)
    promoted += gmail.promoted
    pending += gmail.pending
  } catch (e) {
    errors.push(errorText('Gmail', e))
  }

  try {
    const fintoc = await triggerFintocSync(supabase)
    promoted += fintoc.promoted ?? 0
    pending += fintoc.pending ?? 0
  } catch (e) {
    errors.push(errorText('Fintoc', e))
  }

  let charges: DailyChargesResult | null = null
  try {
    const { data, error } = await supabase.functions.invoke('daily-charges', { body: {} })
    if (error) throw error
    charges = data as DailyChargesResult
  } catch (e) {
    errors.push(errorText('Cobros', e))
  }

  return { promoted, pending, charges, errors }
}

export function SyncButton({ size = 'sm', variant = 'outline', className }: SyncButtonProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: runSync,
    onSettled: () => {
      for (const key of [
        'transactions', 'accounts', 'reconciliation', 'debts', 'recurring-charges',
        'monthly-breakdown', 'sync-state', 'inbox',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    onSuccess: ({ promoted, pending, charges, errors }) => {
      const parts: string[] = []
      if (promoted > 0) parts.push(`${promoted} movimiento(s) nuevo(s)`)
      if (pending > 0) parts.push(`${pending} por revisar`)
      if (charges && charges.processed > 0) parts.push(`${charges.processed} cobro(s)`)

      for (const err of errors) toast.error(err, { duration: 8000 })
      if (parts.length > 0) {
        toast.success(parts.join(' · '), {
          description: charges?.results.slice(0, 4).join(' · '),
          duration: 6000,
        })
      } else if (errors.length === 0) {
        toast.info('Todo al día, nada nuevo')
      }
    },
  })

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className={className}
      title="Traer movimientos de Gmail y Fintoc y cobrar recurrentes pendientes"
    >
      {mutation.isPending ? 'Sincronizando...' : '↻ Sync'}
    </Button>
  )
}
