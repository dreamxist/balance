import type { Debt } from '@/hooks/use-debts'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMoney } from '@/lib/format'

interface DebtListProps {
  debts: Debt[]
  isLoading: boolean
  onSelect: (debt: Debt) => void
  onNewPurchase: () => void
}

export function DebtList({ debts, isLoading, onSelect, onNewPurchase }: DebtListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (debts.length === 0) {
    return (
      <EmptyState
        title="Sin deudas activas"
        description="Registra una compra en cuotas para comenzar"
        action={{ label: "Nueva compra en cuotas", onClick: onNewPurchase }}
      />
    )
  }

  return (
    <div className="space-y-2">
      {debts.map((debt) => {
        const progress = debt.installments > 0
          ? (debt.installments_paid / debt.installments) * 100
          : 0
        const remaining = debt.installments - debt.installments_paid

        return (
          <button
            key={debt.id}
            type="button"
            onClick={() => onSelect(debt)}
            className="flex w-full cursor-pointer flex-col gap-2 rounded-md p-3 text-left transition-colors hover:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {debt.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {debt.account_name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm tabular-nums text-red-500">
                  {formatMoney(-(debt.remaining_amount ?? 0))}
                </p>
                {debt.next_payment_date && (
                  <p className="text-xs text-muted-foreground">
                    {formatPaymentDate(debt.next_payment_date)}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-balanced transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {debt.installments_paid}/{debt.installments} cuotas
                {debt.installment_amount != null && (
                  <> &middot; {formatMoney(debt.installment_amount)}/mes</>
                )}
                {remaining > 0 && (
                  <> &middot; {remaining} restantes</>
                )}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function formatPaymentDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
}
