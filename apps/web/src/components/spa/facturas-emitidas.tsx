import { useState } from 'react'
import { useSpaEmitidas, useMarkInvoicePaid } from '@/hooks/use-spa'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { SpaInvoiceRow } from '@balance/core'
import type { Account } from '@/hooks/use-accounts'

interface FacturasEmitidasProps {
  month: string
  onNew: () => void
  spaAccounts: Account[]
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Enviada', className: 'bg-blue-100 text-blue-700' },
  paid: { label: 'Pagada', className: 'bg-green-100 text-green-700' },
  partially_paid: { label: 'Parcial', className: 'bg-amber-100 text-amber-700' },
  overdue: { label: 'Vencida', className: 'bg-red-100 text-red-700' },
}

export function FacturasEmitidas({ month, onNew, spaAccounts }: FacturasEmitidasProps) {
  const { data: invoices = [], isLoading } = useSpaEmitidas(month)
  const markPaid = useMarkInvoicePaid()
  const [payingId, setPayingId] = useState<string | null>(null)

  const totalNeto = invoices.reduce((s, i) => s + i.neto, 0)
  const totalIva = invoices.reduce((s, i) => s + i.iva, 0)

  function handlePay(invoice: SpaInvoiceRow) {
    const accountId = spaAccounts[0]?.id
    if (!accountId) return
    setPayingId(invoice.id)
    markPaid.mutate(
      { invoiceId: invoice.id, accountId },
      { onSettled: () => setPayingId(null) },
    )
  }

  return (
    <div className="flex h-full flex-col rounded-md border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Facturas emitidas</h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Sin facturas emitidas</p>
      ) : (
        <>
          <div className="flex-1 space-y-2">
            {invoices.map((inv) => {
              const config = statusConfig[inv.status] ?? statusConfig.draft!
              const dateStr = new Date(inv.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{inv.counterpart}</p>
                    <p className="text-xs text-muted-foreground">{dateStr}{inv.folio_sii ? ` — N° ${inv.folio_sii}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="font-mono text-sm">{formatMoney(inv.neto)}</p>
                      <span className="text-xs text-muted-foreground">+IVA {formatMoney(inv.iva)}</span>
                    </div>
                    {inv.status !== 'paid' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={payingId === inv.id}
                        onClick={() => handlePay(inv)}
                      >
                        Cobrar
                      </Button>
                    ) : (
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', config.className)}>
                        {config.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {invoices.length > 0 && (
            <div className="mt-3 flex justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>Neto: {formatMoney(totalNeto)}</span>
              <span>IVA Debito: {formatMoney(totalIva)}</span>
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onNew}
        className="mt-3 w-full rounded-md border border-dashed py-2 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        + Nueva factura emitida
      </button>
    </div>
  )
}
