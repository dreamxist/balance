import { useSpaReimbursables } from '@/hooks/use-spa'
import { formatMoney } from '@/lib/format'

export function ReimbursablesPanel() {
  const { data: items = [], isLoading } = useSpaReimbursables()

  const total = items.reduce((s, i) => s + i.amount, 0)

  if (isLoading || items.length === 0) return null

  return (
    <div className="rounded-md border bg-amber-50 p-5 dark:bg-amber-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">SpA te debe (reembolsos pendientes)</h3>
        <span className="font-mono text-sm font-semibold">{formatMoney(total)}</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const dateStr = new Date(item.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
          return (
            <div key={item.id} className="flex items-center justify-between rounded-md border bg-card p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.description || 'Sin descripcion'}</p>
                <p className="text-xs text-muted-foreground">
                  {dateStr} — {item.account_name}
                  {item.invoice_counterpart && ` — FAC ${item.invoice_counterpart}`}
                </p>
              </div>
              <span className="font-mono">{formatMoney(item.amount)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
