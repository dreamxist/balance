import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useDebts, type Debt } from '@/hooks/use-debts'
import { DebtList } from '@/components/debts/debt-list'
import { DebtDetail } from '@/components/debts/debt-detail'
import { NewPurchaseDialog } from '@/components/debts/new-purchase-dialog'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authenticated/deudas')({
  component: DeudasPage,
})

function DeudasPage() {
  const { data: debts, isLoading } = useDebts()
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [showNewPurchase, setShowNewPurchase] = useState(false)

  if (selectedDebt) {
    const freshDebt = debts?.find((d) => d.id === selectedDebt.id) ?? selectedDebt
    return (
      <DebtDetail
        debt={freshDebt}
        onBack={() => setSelectedDebt(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Deudas</h1>
        <Button onClick={() => setShowNewPurchase(true)}>
          Nueva compra en cuotas
        </Button>
      </div>

      <DebtList
        debts={debts ?? []}
        isLoading={isLoading}
        onSelect={setSelectedDebt}
        onNewPurchase={() => setShowNewPurchase(true)}
      />

      <NewPurchaseDialog
        open={showNewPurchase}
        onOpenChange={setShowNewPurchase}
      />
    </div>
  )
}
