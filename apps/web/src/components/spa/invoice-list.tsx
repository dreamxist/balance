import type { SpaInvoice } from '@balance/core'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

interface InvoiceListProps {
  invoices: SpaInvoice[]
  onNewInvoice: () => void
}

const statusConfig: Record<SpaInvoice['status'], { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Enviada', className: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Pagada', className: 'bg-green-100 text-green-700' },
  partially_paid: { label: 'Parcial', className: 'bg-amber-100 text-amber-700' },
  overdue: { label: 'Vencida', className: 'bg-red-100 text-red-700' },
}

export function InvoiceList({ invoices, onNewInvoice }: InvoiceListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Facturas emitidas</h3>
      </div>

      {invoices.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Sin facturas</p>
      ) : (
        <div className="flex-1 space-y-2">
          {invoices.map((invoice) => {
            const config = statusConfig[invoice.status]
            const month = new Date(invoice.date).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
            return (
              <div key={invoice.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invoice.client}</p>
                  <p className="text-xs text-muted-foreground">{month}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-mono text-sm">{formatMoney(invoice.net)}</p>
                    <span className="text-xs text-muted-foreground">+IVA</span>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', config.className)}>
                    {config.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onNewInvoice}
        className="mt-3 w-full rounded-md border border-dashed py-2 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        + Nueva factura
      </button>
    </div>
  )
}
