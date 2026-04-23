import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OnboardingAccount } from '@balance/core'

function formatCLP(value: number): string {
  return value.toLocaleString('es-CL')
}

function parseCLP(raw: string): number {
  return parseInt(raw.replace(/\D/g, ''), 10) || 0
}

type DebtEntry = {
  name: string
  subtype: 'credit_card' | 'payable'
  balance: number
  creditLimit: number
}

export function StepDebts({
  onNext,
  onSkip,
}: {
  onNext: (accounts: OnboardingAccount[]) => void
  onSkip: () => void
}) {
  const [hasDebt, setHasDebt] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'quick' | 'detailed'>('quick')
  const [quickTotal, setQuickTotal] = useState('')
  const [debts, setDebts] = useState<DebtEntry[]>([
    { name: '', subtype: 'credit_card', balance: 0, creditLimit: 0 },
  ])

  function handleQuickSubmit() {
    const total = parseCLP(quickTotal)
    if (total <= 0) return
    onNext([{ name: 'Mis deudas', type: 'liability', subtype: 'credit_card', balance: -total }])
  }

  function handleDetailedSubmit() {
    const valid = debts.filter((d) => d.name.trim() && d.balance > 0)
    if (valid.length === 0) return
    onNext(
      valid.map((d) => ({
        name: d.name,
        type: 'liability' as const,
        subtype: d.subtype,
        balance: -d.balance,
        creditLimit: d.creditLimit > 0 ? d.creditLimit : undefined,
      })),
    )
  }

  function updateDebt(index: number, updates: Partial<DebtEntry>) {
    setDebts((prev) => prev.map((d, i) => (i === index ? { ...d, ...updates } : d)))
  }

  function addDebt() {
    setDebts((prev) => [...prev, { name: '', subtype: 'credit_card', balance: 0, creditLimit: 0 }])
  }

  function removeDebt(index: number) {
    setDebts((prev) => prev.filter((_, i) => i !== index))
  }

  if (hasDebt === null) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Debes algo?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tarjetas de credito, cuotas, prestamos
          </p>
        </div>
        <div className="space-y-3">
          <Button onClick={() => setHasDebt(true)} variant="outline" className="w-full" size="lg">
            Si, debo
          </Button>
          <Button onClick={onSkip} variant="ghost" className="w-full" size="lg">
            No debo nada
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cuanto debes?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresa montos como positivos, se guardan como deuda
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('quick')}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            mode === 'quick'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          Total rapido
        </button>
        <button
          type="button"
          onClick={() => setMode('detailed')}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            mode === 'detailed'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          Por deuda
        </button>
      </div>

      {mode === 'quick' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <label className="text-sm text-muted-foreground">Total de deudas</label>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl text-muted-foreground">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={quickTotal}
                onChange={(e) => {
                  const num = parseCLP(e.target.value)
                  setQuickTotal(num > 0 ? formatCLP(num) : '')
                }}
                className="w-full border-none bg-transparent text-3xl font-mono focus:outline-none"
                placeholder="0"
                autoFocus
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setHasDebt(null)} variant="ghost" className="flex-1" size="lg">
              Atras
            </Button>
            <Button onClick={handleQuickSubmit} className="flex-1" size="lg" disabled={parseCLP(quickTotal) <= 0}>
              Siguiente
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {debts.map((debt, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={debt.name}
                  onChange={(e) => updateDebt(i, { name: e.target.value })}
                  className="border-none bg-transparent text-sm font-medium focus:outline-none"
                  placeholder="Nombre (ej: CC Mastercard)"
                />
                {debts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDebt(i)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={debt.subtype}
                  onChange={(e) =>
                    updateDebt(i, { subtype: e.target.value as 'credit_card' | 'payable' })
                  }
                  className="rounded-sm border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="credit_card">Tarjeta de credito</option>
                  <option value="payable">Prestamo / cuotas</option>
                </select>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={debt.balance > 0 ? formatCLP(debt.balance) : ''}
                  onChange={(e) => updateDebt(i, { balance: parseCLP(e.target.value) })}
                  className="w-full border-none bg-transparent text-xl font-mono focus:outline-none"
                  placeholder="Monto que debes"
                />
              </div>
              {debt.subtype === 'credit_card' && (
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-muted-foreground">Cupo:</span>
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={debt.creditLimit > 0 ? formatCLP(debt.creditLimit) : ''}
                    onChange={(e) => updateDebt(i, { creditLimit: parseCLP(e.target.value) })}
                    className="w-full border-none bg-transparent text-sm font-mono focus:outline-none"
                    placeholder="Cupo total (opcional)"
                  />
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addDebt}
            className="w-full rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground/60"
          >
            + Agregar deuda
          </button>

          <div className="flex gap-3">
            <Button onClick={() => setHasDebt(null)} variant="ghost" className="flex-1" size="lg">
              Atras
            </Button>
            <Button
              onClick={handleDetailedSubmit}
              className="flex-1"
              size="lg"
              disabled={debts.every((d) => !d.name.trim() || d.balance <= 0)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
