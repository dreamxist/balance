import { useState } from 'react'
import { useF29Summary, useMarkF29Declared } from '@/hooks/use-spa'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface F29SummaryProps {
  year: number
  month: number
}

export function F29Summary({ year, month }: F29SummaryProps) {
  const { data, isLoading } = useF29Summary(year, month)
  const [dialogOpen, setDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="rounded-md border bg-card p-5">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const deadline = new Date(data.deadline + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysToDeadline = Math.floor((deadline.getTime() - today.getTime()) / 86400000)
  const isDeclared = data.declared !== null
  const isOverdue = !isDeclared && daysToDeadline < 0
  const isUrgent = !isDeclared && daysToDeadline >= 0 && daysToDeadline <= 7

  const deadlineStr = deadline.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <div className="rounded-md border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">F29</h3>
          {isDeclared ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
              ✓ Declarado
            </span>
          ) : isOverdue ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400">
              Vencido hace {Math.abs(daysToDeadline)}d
            </span>
          ) : isUrgent ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              {daysToDeadline === 0 ? 'Vence hoy' : `${daysToDeadline}d restantes`}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Plazo {deadlineStr}
            </span>
          )}
        </div>

        <div className="space-y-1.5 text-sm">
          <Row label="IVA Debito Fiscal" value={data.iva_debito} />
          <Row label="IVA Credito Fiscal" value={-data.iva_credito} className="text-green-600" />
          {data.remanente_anterior > 0 && (
            <Row label="Remanente anterior" value={-data.remanente_anterior} className="text-blue-500" />
          )}

          <div className="my-2 border-t" />

          <Row label="IVA neto" value={data.iva_neto} bold />
          <Row label="PPM (0,25%)" value={data.ppm} />

          <div className="my-2 border-t" />

          <div className="flex items-center justify-between font-semibold">
            <span>Total F29</span>
            <span className="font-mono text-base">{formatMoney(data.f29_total)}</span>
          </div>

          {data.remanente_siguiente > 0 && (
            <p className="mt-2 text-xs text-blue-500">
              Remanente prox. mes: {formatMoney(data.remanente_siguiente)}
            </p>
          )}
        </div>

        {isDeclared && data.declared ? (
          <div className="mt-3 rounded-md bg-green-50 p-2 text-xs dark:bg-green-950/20">
            Declarado el {new Date(data.declared.declared_at + 'T00:00:00').toLocaleDateString('es-CL')}
            {data.declared.confirmation_number && ` — N° ${data.declared.confirmation_number}`}
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full text-xs"
            onClick={() => setDialogOpen(true)}
          >
            Marcar como declarado
          </Button>
        )}
      </div>

      <MarkDeclaredDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        year={year}
        month={month}
      />
    </>
  )
}

function Row({ label, value, bold, className }: {
  label: string
  value: number
  bold?: boolean
  className?: string
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-medium' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${className ?? ''}`}>{formatMoney(value)}</span>
    </div>
  )
}

function MarkDeclaredDialog({ open, onClose, year, month }: {
  open: boolean
  onClose: () => void
  year: number
  month: number
}) {
  const [declaredAt, setDeclaredAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [confirmationNumber, setConfirmationNumber] = useState('')
  const [notes, setNotes] = useState('')
  const mutation = useMarkF29Declared()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    mutation.mutate(
      {
        year,
        month,
        declaredAt,
        confirmationNumber: confirmationNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => onClose() },
    )
  }

  if (!open) return null

  const monthName = new Date(year, month - 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">Marcar F29 como declarado</h2>
        <p className="mb-4 text-sm capitalize text-muted-foreground">{monthName}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="f29-date">Fecha de declaracion</Label>
            <Input
              id="f29-date"
              type="date"
              value={declaredAt}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeclaredAt(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="f29-confirmation">N° confirmacion SII (opcional)</Label>
            <Input
              id="f29-confirmation"
              value={confirmationNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmationNumber(e.target.value)}
              placeholder="Ej: 123456789"
            />
          </div>

          <div>
            <Label htmlFor="f29-notes">Notas (opcional)</Label>
            <Input
              id="f29-notes"
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
              placeholder="Cualquier observacion"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Marcar declarado'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
