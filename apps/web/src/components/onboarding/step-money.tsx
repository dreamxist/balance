import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OnboardingAccount } from '@balance/core'

function formatCLP(value: number): string {
  return value.toLocaleString('es-CL')
}

function parseCLP(raw: string): number {
  return parseInt(raw.replace(/\D/g, ''), 10) || 0
}

type DetailedAccount = {
  name: string
  subtype: 'debit' | 'cash'
  balance: number
}

export function StepMoney({ onNext }: { onNext: (accounts: OnboardingAccount[]) => void }) {
  const [mode, setMode] = useState<'quick' | 'detailed'>('quick')
  const [quickTotal, setQuickTotal] = useState('')
  const [accounts, setAccounts] = useState<DetailedAccount[]>([
    { name: '', subtype: 'debit', balance: 0 },
  ])

  function handleQuickSubmit() {
    const total = parseCLP(quickTotal)
    if (total <= 0) return
    onNext([{ name: 'Mi dinero', type: 'asset', subtype: 'debit', balance: total }])
  }

  function handleDetailedSubmit() {
    const valid = accounts.filter((a) => a.name.trim() && a.balance > 0)
    if (valid.length === 0) return
    onNext(
      valid.map((a) => ({
        name: a.name,
        type: 'asset' as const,
        subtype: a.subtype,
        balance: a.balance,
      })),
    )
  }

  function updateAccount(index: number, updates: Partial<DetailedAccount>) {
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, ...updates } : a)))
  }

  function addAccount() {
    setAccounts((prev) => [...prev, { name: '', subtype: 'debit', balance: 0 }])
  }

  function removeAccount(index: number) {
    setAccounts((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cuanto tienes?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresa el total de tu dinero disponible
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
          Por cuenta
        </button>
      </div>

      {mode === 'quick' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <label className="text-sm text-muted-foreground">Total disponible</label>
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
          <Button onClick={handleQuickSubmit} className="w-full" size="lg" disabled={parseCLP(quickTotal) <= 0}>
            Siguiente
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={account.name}
                  onChange={(e) => updateAccount(i, { name: e.target.value })}
                  className="border-none bg-transparent text-sm font-medium focus:outline-none"
                  placeholder="Nombre de la cuenta"
                />
                {accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccount(i)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={account.subtype}
                  onChange={(e) => updateAccount(i, { subtype: e.target.value as 'debit' | 'cash' })}
                  className="rounded-sm border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="debit">Debito</option>
                  <option value="cash">Efectivo</option>
                </select>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={account.balance > 0 ? formatCLP(account.balance) : ''}
                  onChange={(e) => updateAccount(i, { balance: parseCLP(e.target.value) })}
                  className="w-full border-none bg-transparent text-xl font-mono focus:outline-none"
                  placeholder="0"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addAccount}
            className="w-full rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground/60"
          >
            + Agregar cuenta
          </button>

          <Button
            onClick={handleDetailedSubmit}
            className="w-full"
            size="lg"
            disabled={accounts.every((a) => !a.name.trim() || a.balance <= 0)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}
