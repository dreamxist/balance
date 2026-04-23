import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { archiveDebt } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Debt } from '@/hooks/use-debts'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { PayInstallmentDialog } from '@/components/debts/pay-installment-dialog'

interface DebtDetailProps {
  debt: Debt
  onBack: () => void
}

export function DebtDetail({ debt, onBack }: DebtDetailProps) {
  const queryClient = useQueryClient()
  const [payMode, setPayMode] = useState<'installment' | 'payoff' | null>(null)

  const archiveMutation = useMutation({
    mutationFn: () => archiveDebt(supabase, debt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      toast.success('Deuda archivada')
      onBack()
    },
    onError: () => {
      toast.error('Error al archivar deuda')
    },
  })

  const progress = debt.installments > 0
    ? (debt.installments_paid / debt.installments) * 100
    : 0

  const installments = generateInstallmentSchedule(debt)

  return (
    <div className="space-y-4 md:space-y-6">
      <Button
        variant="ghost"
        onClick={onBack}
        className="text-muted-foreground"
      >
        &larr; {debt.description}
      </Button>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatItem label="Total" value={formatMoney(debt.total_amount)} />
        <StatItem
          label="Cuotas"
          value={`${debt.installments} de ${formatMoney(debt.installment_amount ?? 0)}`}
        />
        <StatItem
          label="Pagadas"
          value={`${debt.installments_paid} / ${debt.installments}`}
        />
        <StatItem
          label="Restante"
          value={formatMoney(debt.remaining_amount ?? 0)}
          mono
        />
        <StatItem
          label="Proxima"
          value={debt.next_payment_date ? formatMonth(debt.next_payment_date) : '-'}
        />
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progreso</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-balanced transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Installment schedule */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4">#</th>
              <th className="pb-2 pr-4">Fecha</th>
              <th className="pb-2 pr-4 text-right">Monto</th>
              <th className="pb-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((inst) => (
              <tr key={inst.number} className="border-b border-border/50">
                <td className="py-2 pr-4 text-muted-foreground">
                  {inst.number}/{debt.installments}
                </td>
                <td className="py-2 pr-4">{inst.dateLabel}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">
                  {formatMoney(inst.amount)}
                </td>
                <td className="py-2">
                  {inst.paid ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-balanced">
                      <span className="size-1.5 rounded-full bg-balanced" />
                      Pagada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                      Pendiente
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Cuenta: {debt.account_name}</span>
        {debt.category && <span>Categoria: {debt.category}</span>}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPayMode('installment')}>
          Pagar cuota
        </Button>
        <Button variant="secondary" onClick={() => setPayMode('payoff')}>
          Pagar todo
        </Button>
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending}
        >
          {archiveMutation.isPending ? 'Archivando...' : 'Archivar'}
        </Button>
      </div>

      {payMode && (
        <PayInstallmentDialog
          open={true}
          onOpenChange={(open) => { if (!open) setPayMode(null) }}
          debt={debt}
          mode={payMode}
        />
      )}
    </div>
  )
}

function StatItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </p>
    </div>
  )
}

interface InstallmentRow {
  number: number
  dateLabel: string
  amount: number
  paid: boolean
}

function generateInstallmentSchedule(debt: Debt): InstallmentRow[] {
  const rows: InstallmentRow[] = []
  const baseDate = debt.created_at ? new Date(debt.created_at) : new Date()
  const installmentAmount = debt.installment_amount ?? 0

  for (let i = 1; i <= debt.installments; i++) {
    const date = new Date(baseDate)
    date.setMonth(date.getMonth() + (i - 1))

    const isLast = i === debt.installments
    const amount = isLast
      ? debt.total_amount - installmentAmount * (debt.installments - 1)
      : installmentAmount

    rows.push({
      number: i,
      dateLabel: formatMonth(date.toISOString()),
      amount,
      paid: i <= debt.installments_paid,
    })
  }

  return rows
}

function formatMonth(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.toLocaleDateString('es-CL', { month: 'long' })
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`
}
