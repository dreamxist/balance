import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTransactions, type TransactionFilters } from '@/hooks/use-transactions'
import { TransactionFiltersBar } from '@/components/transactions/transaction-filters'
import { TransactionList } from '@/components/transactions/transaction-list'
import { BalanceHistoryChart } from '@/components/transactions/balance-history-chart'
import { CuadrarPanel } from '@/components/transactions/cuadrar-panel'
import { PorCategorizarPanel } from '@/components/transactions/por-categorizar-panel'
import { SyncButton } from '@/components/sync-button'
import { Fab } from '@/components/ui/fab'
import { BottomSheet } from '@/components/ui/bottom-sheet'

export const Route = createFileRoute('/_authenticated/movimientos')({
  component: MovimientosPage,
})

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function MovimientosPage() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [filters, setFilters] = useState<TransactionFilters>({
    month: getCurrentMonth(),
  })

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useTransactions(filters)

  const transactions = data?.pages.flat() ?? []

  const hasFilters = Boolean(
    filters.category || filters.accountId || filters.type || filters.search,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Movimientos</h1>
        <SyncButton />
      </div>
      <BalanceHistoryChart />
      <CuadrarPanel />
      <PorCategorizarPanel />
      <TransactionFiltersBar filters={filters} onFiltersChange={setFilters} />
      {/* MonthlySummary removed — cuadrar panel already shows income/expenses */}
      <TransactionList
        transactions={transactions}
        isLoading={isLoading}
        hasNextPage={hasNextPage ?? false}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        hasFilters={hasFilters}
      />
      <Fab onClick={() => setSheetOpen(true)} />
      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Nuevo movimiento">
        <div className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-muted"
            onClick={() => {
              setSheetOpen(false)
            }}
          >
            Registrar movimiento
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
