import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { payDebtInstallment, payOffDebt } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Debt } from '@/hooks/use-debts'
import { formatMoney } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PayInstallmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt: Debt
  mode: 'installment' | 'payoff'
}

export function PayInstallmentDialog({
  open,
  onOpenChange,
  debt,
  mode,
}: PayInstallmentDialogProps) {
  const queryClient = useQueryClient()
  const [actualAmount, setActualAmount] = useState('')

  const nextInstallment = debt.installments_paid + 1

  const installmentMutation = useMutation({
    mutationFn: () => payDebtInstallment(supabase, debt.id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      toast.success('Cuota pagada')
      onOpenChange(false)
    },
    onError: () => {
      toast.error('Error al pagar cuota')
    },
  })

  const payoffMutation = useMutation({
    mutationFn: () => {
      const amount = actualAmount ? parseInt(actualAmount, 10) : undefined
      return payOffDebt(supabase, debt.id!, amount)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      toast.success('Deuda saldada')
      onOpenChange(false)
    },
    onError: () => {
      toast.error('Error al saldar deuda')
    },
  })

  const isPending = installmentMutation.isPending || payoffMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {mode === 'installment' ? (
          <>
            <DialogHeader>
              <DialogTitle>Pagar cuota</DialogTitle>
              <DialogDescription>
                Cuota {nextInstallment} de {debt.description}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm">
              Monto:{' '}
              <span className="font-mono tabular-nums font-medium">
                {formatMoney(debt.installment_amount ?? 0)}
              </span>
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={() => installmentMutation.mutate()} disabled={isPending}>
                {isPending ? 'Pagando...' : 'Confirmar pago'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pagar total restante</DialogTitle>
              <DialogDescription>
                Saldar deuda de {debt.description}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm">
                Restante:{' '}
                <span className="font-mono tabular-nums font-medium">
                  {formatMoney(debt.remaining_amount ?? 0)}
                </span>
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="actual-amount">Monto real (opcional, si hay descuento)</Label>
                <Input
                  id="actual-amount"
                  type="number"
                  min={1}
                  placeholder={String(debt.remaining_amount ?? 0)}
                  value={actualAmount}
                  onChange={(e) => setActualAmount(e.target.value)}
                  className="font-mono tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Deja vacio para pagar el monto completo
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button onClick={() => payoffMutation.mutate()} disabled={isPending}>
                {isPending ? 'Pagando...' : 'Saldar deuda'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
