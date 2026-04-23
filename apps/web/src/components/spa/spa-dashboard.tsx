import { useState } from 'react'
import { useSpaDashboard } from '@/hooks/use-spa'
import { formatMoney } from '@/lib/format'
import { MonthSelector } from './month-selector'
import { F29Summary } from './f29-summary'
import { FacturasEmitidas } from './facturas-emitidas'
import { FacturasRecibidas } from './facturas-recibidas'
import { InvoiceDialog } from './invoice-dialog'
import { ProfitSummary } from './profit-summary'
import { ReimbursablesPanel } from './reimbursables-panel'
import type { InvoiceDirection } from '@balance/core'

export function SpaDashboard() {
  const [period, setPeriod] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const monthStr = `${period.year}-${String(period.month).padStart(2, '0')}`

  const [dialogDirection, setDialogDirection] = useState<InvoiceDirection | null>(null)
  const dashboard = useSpaDashboard()

  const accounts = dashboard.data?.accounts ?? []
  const totalBalance = accounts.reduce((sum: number, acc: { balance: number }) => sum + acc.balance, 0)

  if (dashboard.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-md border bg-card" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MonthSelector value={period} onChange={setPeriod} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {accounts.length > 0 ? accounts[0]!.name : 'Saldo empresa'}
          </p>
          <p className="mt-1 text-2xl font-mono font-semibold">{formatMoney(totalBalance)}</p>
          {accounts.length > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {accounts.length} cuentas empresa
            </p>
          )}
        </div>

        <F29Summary year={period.year} month={period.month} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FacturasEmitidas
          month={monthStr}
          onNew={() => setDialogDirection('emitida')}
          spaAccounts={accounts}
        />
        <FacturasRecibidas
          month={monthStr}
          onNew={() => setDialogDirection('recibida')}
        />
      </div>

      <ReimbursablesPanel />

      <div className="rounded-md border bg-card p-5">
        <ProfitSummary
          profit={dashboard.data?.monthlyIncome ?? 0}
          year={period.year}
        />
      </div>

      <InvoiceDialog
        open={dialogDirection !== null}
        onClose={() => setDialogDirection(null)}
        direction={dialogDirection ?? 'emitida'}
        spaAccounts={accounts}
      />
    </div>
  )
}
