import { useSpaRecibidas } from '@/hooks/use-spa'
import { formatMoney } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

interface FacturasRecibidasProps {
  month: string
  onNew: () => void
}

export function FacturasRecibidas({ month, onNew }: FacturasRecibidasProps) {
  const { data: invoices = [], isLoading } = useSpaRecibidas(month)
  const qc = useQueryClient()

  const totalNeto = invoices.reduce((s, i) => s + i.neto, 0)
  const totalCredito = invoices.filter((i) => i.in_rcv).reduce((s, i) => s + i.iva, 0)

  async function toggleRcv(id: string, current: boolean) {
    await supabase.from('spa_invoices').update({ in_rcv: !current }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['spa'] })
  }

  return (
    <div className="flex h-full flex-col rounded-md border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Facturas recibidas</h3>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Sin facturas recibidas</p>
      ) : (
        <>
          <div className="flex-1 space-y-2">
            {invoices.map((inv) => {
              const dateStr = new Date(inv.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{inv.counterpart}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {inv.description}{inv.folio_sii ? ` — N° ${inv.folio_sii}` : ''} — {dateStr}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-sm">{formatMoney(inv.neto)}</p>
                      <span className={`text-xs font-mono ${inv.in_rcv ? 'text-green-600' : 'text-muted-foreground'}`}>
                        IVA {formatMoney(inv.iva)}
                      </span>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground" title="En RCV SII">
                      <input
                        type="checkbox"
                        checked={inv.in_rcv}
                        onChange={() => toggleRcv(inv.id, inv.in_rcv)}
                        className="h-3.5 w-3.5 rounded border-input accent-green-600"
                      />
                      RCV
                    </label>
                  </div>
                </div>
              )
            })}
          </div>

          {invoices.length > 0 && (
            <div className="mt-3 flex justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>Neto: {formatMoney(totalNeto)}</span>
              <span className="text-green-600">Credito fiscal: {formatMoney(totalCredito)}</span>
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onNew}
        className="mt-3 w-full rounded-md border border-dashed py-2 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        + Nueva factura recibida
      </button>
    </div>
  )
}
