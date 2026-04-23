import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createInstallmentPurchase } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import { formatMoney } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface NewPurchaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewPurchaseDialog({ open, onOpenChange }: NewPurchaseDialogProps) {
  const queryClient = useQueryClient()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [installments, setInstallments] = useState('')
  const [accountId, setAccountId] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState('')
  const [firstPaymentDate, setFirstPaymentDate] = useState('')

  const liabilityAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === 'liability'),
    [accounts],
  )

  const parsedAmount = parseInt(amount, 10) || 0
  const parsedInstallments = parseInt(installments, 10) || 0
  const installmentAmount = parsedInstallments > 0
    ? Math.round(parsedAmount / parsedInstallments)
    : 0

  const mutation = useMutation({
    mutationFn: () =>
      createInstallmentPurchase(supabase, {
        amount: parsedAmount,
        installments: parsedInstallments,
        category,
        accountId,
        description,
        date: date || undefined,
        firstPaymentDate: firstPaymentDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      toast.success('Compra en cuotas registrada', {
        description: `${parsedInstallments} cuotas de ${formatMoney(installmentAmount)}`,
      })
      resetForm()
      onOpenChange(false)
    },
    onError: () => {
      toast.error('Error al registrar compra')
    },
  })

  function resetForm() {
    setDescription('')
    setAmount('')
    setInstallments('')
    setAccountId('')
    setCategory('')
    setDate('')
    setFirstPaymentDate('')
  }

  const isValid = description.trim() && parsedAmount > 0 && parsedInstallments >= 2 && accountId && category

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva compra en cuotas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="np-description">Descripcion</Label>
            <Input
              id="np-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Sneakers demo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-amount">Monto total</Label>
              <Input
                id="np-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="180000"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-installments">Cuotas</Label>
              <Input
                id="np-installments"
                type="number"
                min={2}
                max={48}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                placeholder="6"
              />
            </div>
          </div>

          {installmentAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              Cuota mensual:{' '}
              <span className="font-mono tabular-nums font-medium text-foreground">
                {formatMoney(installmentAmount)}
              </span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Tarjeta / Cuenta</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                {liabilityAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-date">Fecha (opcional)</Label>
              <Input
                id="np-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-first-payment">Primera cuota (opcional)</Label>
              <Input
                id="np-first-payment"
                type="date"
                value={firstPaymentDate}
                onChange={(e) => setFirstPaymentDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? 'Registrando...' : 'Registrar compra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
