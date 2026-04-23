import { useState, useEffect } from 'react'
import { useCreateSpaInvoice, useUploadFactura } from '@/hooks/use-spa'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Account } from '@/hooks/use-accounts'
import type { InvoiceDirection, DocumentType, SpaInvoiceRow } from '@balance/core'

interface InvoiceDialogProps {
  open: boolean
  onClose: () => void
  direction: InvoiceDirection
  spaAccounts: Account[]
}

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'factura_afecta', label: 'Factura afecta' },
  { value: 'factura_exenta', label: 'Factura exenta' },
  { value: 'boleta', label: 'Boleta' },
  { value: 'factura_exportacion', label: 'Factura exportacion' },
  { value: 'nota_credito', label: 'Nota de credito' },
  { value: 'nota_debito', label: 'Nota de debito' },
]

const IVA_DOC_TYPES: DocumentType[] = ['factura_afecta', 'boleta']

export function InvoiceDialog({ open, onClose, direction, spaAccounts }: InvoiceDialogProps) {
  const [counterpart, setCounterpart] = useState('')
  const [netAmount, setNetAmount] = useState('')
  const [docType, setDocType] = useState<DocumentType>('factura_afecta')
  const [description, setDescription] = useState('')
  const [folioSii, setFolioSii] = useState('')
  const [date, setDate] = useState('')
  const [accountId, setAccountId] = useState(spaAccounts[0]?.id ?? '')
  const [createTransaction, setCreateTransaction] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  const mutation = useCreateSpaInvoice()
  const uploadMutation = useUploadFactura()

  const net = Number(netAmount) || 0
  const hasIva = IVA_DOC_TYPES.includes(docType)
  const iva = hasIva ? Math.round(net * 0.19) : 0
  const total = net + iva

  const isEmitida = direction === 'emitida'
  const title = isEmitida ? 'Nueva factura emitida' : 'Nueva factura recibida'
  const counterpartLabel = isEmitida ? 'Cliente' : 'Proveedor'

  useEffect(() => {
    if (open) {
      setCounterpart('')
      setNetAmount('')
      setDocType('factura_afecta')
      setDescription('')
      setFolioSii('')
      setDate('')
      setAccountId(spaAccounts[0]?.id ?? '')
      setCreateTransaction(false)
      setFile(null)
    }
  }, [open, spaAccounts])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!counterpart.trim() || net <= 0) return

    mutation.mutate(
      {
        direction,
        counterpart: counterpart.trim(),
        neto: net,
        docType,
        description: description.trim(),
        folioSii: folioSii.trim() || undefined,
        date: date || undefined,
        accountId: isEmitida && createTransaction ? accountId : undefined,
        createTransaction: isEmitida ? createTransaction : false,
      },
      {
        onSuccess: async (created) => {
          const invoice = created as SpaInvoiceRow
          if (file && invoice?.id) {
            try {
              await uploadMutation.mutateAsync({ invoiceId: invoice.id, file })
            } catch {
              // error already shown in toast
            }
          }
          onClose()
        },
      },
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="inv-counterpart">{counterpartLabel}</Label>
            <Input
              id="inv-counterpart"
              value={counterpart}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCounterpart(e.target.value)}
              placeholder={isEmitida ? 'Nombre del cliente' : 'Nombre del proveedor'}
              required
            />
          </div>

          <div>
            <Label htmlFor="inv-doc-type">Tipo de documento</Label>
            <select
              id="inv-doc-type"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={docType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDocType(e.target.value as DocumentType)}
            >
              {DOC_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="inv-net">Monto neto</Label>
            <Input
              id="inv-net"
              type="text"
              inputMode="numeric"
              className="font-mono"
              value={netAmount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNetAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              required
            />
          </div>

          <div className="rounded-md bg-muted p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IVA (19%)</span>
              <span className="font-mono">{hasIva ? formatMoney(iva) : '$0 (exenta)'}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm font-medium">
              <span>Total</span>
              <span className="font-mono">{formatMoney(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inv-folio">N° Folio SII</Label>
              <Input
                id="inv-folio"
                value={folioSii}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolioSii(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div>
              <Label htmlFor="inv-date">Fecha</Label>
              <Input
                id="inv-date"
                type="date"
                value={date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inv-desc">Descripcion</Label>
            <Input
              id="inv-desc"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              placeholder={isEmitida ? 'Servicio prestado' : 'Detalle de la compra'}
            />
          </div>

          <div>
            <Label htmlFor="inv-file">Factura (PDF/XML)</Label>
            <input
              id="inv-file"
              type="file"
              accept=".pdf,.xml,image/*"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          {isEmitida && (
            <>
              <div className="flex items-center gap-2">
                <input
                  id="inv-paid"
                  type="checkbox"
                  checked={createTransaction}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreateTransaction(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="inv-paid" className="text-sm font-normal">
                  Ya cobrada (crear ingreso)
                </Label>
              </div>

              {createTransaction && spaAccounts.length > 0 && (
                <div>
                  <Label htmlFor="inv-account">Cuenta destino</Label>
                  <select
                    id="inv-account"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={accountId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAccountId(e.target.value)}
                  >
                    {spaAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || !counterpart.trim() || net <= 0}>
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
