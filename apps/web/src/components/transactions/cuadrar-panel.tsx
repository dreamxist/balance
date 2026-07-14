import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTransaction } from '@balance/core'
import { useReconciliation } from '@/hooks/use-reconciliation'
import { useMonthlyBreakdown } from '@/hooks/use-monthly-breakdown'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import { useAutoCharges } from '@/hooks/use-auto-charges'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Mode = 'idle' | 'gasto' | 'ingreso' | 'transfer'

const GASTO_GROUPS = [
  { key: 'necesidad', label: 'Necesidades', color: 'bg-blue-500', textColor: 'text-blue-500' },
  { key: 'consumo', label: 'Consumo', color: 'bg-orange-500', textColor: 'text-orange-500' },
  { key: 'ahorro', label: 'Ahorro', color: 'bg-violet-500', textColor: 'text-violet-500' },
] as const

export function CuadrarPanel() {
  const reconciliation = useReconciliation()
  const monthly = useMonthlyBreakdown()
  const accounts = useAccounts()
  const categories = useCategories()
  const autoCharges = useAutoCharges()
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('idle')
  const [showCharges, setShowCharges] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState('')

  const delta = reconciliation.data?.delta ?? 0
  const deltaStatus = reconciliation.data?.delta_status ?? 'green'
  const income = monthly.data?.income ?? 0
  const gastado = (monthly.data?.necesidades ?? 0) + (monthly.data?.consumo ?? 0)
    + (monthly.data?.ahorro ?? 0) + (monthly.data?.por_categorizar ?? 0)
  const disponible = monthly.data?.disponible ?? 0

  const allAccounts = (accounts.data ?? []).filter((a) => !a.is_archived && a.on_budget)
  const debitAccounts = allAccounts.filter((a) => a.type === 'asset' && (a.subtype === 'debit' || a.subtype === 'cash'))

  // Group subcategories by parent
  const allCats = categories.data ?? []
  function getSubcategories(parentKey: string) {
    return allCats.filter((c) => {
      const id = c.id as string
      return id.startsWith(`${parentKey}.`) && id !== parentKey
    })
  }

  const ingresoSubs = getSubcategories('ingreso')

  const createMut = useMutation({
    mutationFn: (input: { amount: number; category: string; accountId: string; description: string; type: 'income' | 'expense' | 'refund' }) =>
      createTransaction(supabase, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-breakdown'] })
      toast.success('Movimiento registrado')
      resetForm()
    },
    onError: (e) => toast.error(e.message),
  })

  function resetForm() {
    setMode('idle')
    setSelectedGroup(null)
    setSelectedCategory('')
    setAmount('')
    setDescription('')
  }

  function handleSubmit() {
    const amt = parseInt(amount.replace(/\./g, ''), 10)
    if (!amt || !accountId) return

    if (mode === 'gasto' && selectedCategory) {
      createMut.mutate({ amount: amt, category: selectedCategory, accountId, description, type: 'expense' })
    } else if (mode === 'ingreso' && selectedCategory) {
      createMut.mutate({ amount: amt, category: selectedCategory, accountId, description, type: 'income' })
    }
  }

  // Default account
  if (!accountId && debitAccounts.length > 0) {
    setAccountId(debitAccounts[0]!.id)
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 md:p-5 space-y-4">
      {/* Header: disponible del mes + ingresos/gastos */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Disponible este mes</p>
          <p className={cn(
            'font-mono text-2xl font-bold tabular-nums',
            disponible < 0 && 'text-red-500',
          )}>
            {formatMoney(disponible)}
          </p>
        </div>
        <div className="text-right text-sm space-y-0.5">
          <p className="text-muted-foreground">
            Ingresos <span className="font-mono text-foreground">{formatMoney(income)}</span>
          </p>
          <p className="text-muted-foreground">
            Gastos <span className="font-mono text-foreground">{formatMoney(gastado)}</span>
          </p>
          {delta !== 0 ? (
            <p className={cn(
              'font-mono text-xs font-medium',
              deltaStatus === 'green' ? 'text-emerald-500' : deltaStatus === 'amber' ? 'text-amber-500' : 'text-red-500',
            )}>
              Delta {delta > 0 ? '+' : ''}{formatMoney(delta)}
            </p>
          ) : (
            <p className="text-xs text-emerald-500 font-medium">✓ Cuadrado</p>
          )}
        </div>
      </div>

      {/* Charges toggle */}
      {autoCharges.charges.length > 0 && (
        <ChargesSection charges={autoCharges} open={showCharges} onToggle={() => setShowCharges(!showCharges)} />
      )}

      {/* Action buttons */}
      {mode === 'idle' && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setMode('gasto')}>
            + Gasto
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setMode('ingreso')}>
            + Ingreso
          </Button>
          <Button variant="outline" className="flex-1 text-muted-foreground" onClick={() => setMode('transfer')}>
            Transferir
          </Button>
        </div>
      )}

      {/* Gasto form */}
      {mode === 'gasto' && (
        <div className="space-y-3">
          {/* Parent category pills */}
          <div className="flex gap-2">
            {GASTO_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => { setSelectedGroup(g.key); setSelectedCategory('') }}
                className={cn(
                  'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                  selectedGroup === g.key ? `${g.color} text-white` : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Subcategory pills */}
          {selectedGroup && (
            <div className="flex flex-wrap gap-1.5">
              {getSubcategories(selectedGroup).map((sub) => {
                const id = sub.id as string
                const label = sub.name as string
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedCategory(id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      selectedCategory === id
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setSelectedCategory(`${selectedGroup}.otro`)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  selectedCategory === `${selectedGroup}.otro`
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                Otro
              </button>
            </div>
          )}

          {/* Amount + description + submit */}
          {selectedCategory && (
            <TransactionFormFields
              amount={amount}
              setAmount={setAmount}
              description={description}
              setDescription={setDescription}
              accountId={accountId}
              setAccountId={setAccountId}
              accounts={debitAccounts}
              onSubmit={handleSubmit}
              onCancel={resetForm}
              isPending={createMut.isPending}
            />
          )}
        </div>
      )}

      {/* Ingreso form */}
      {mode === 'ingreso' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {ingresoSubs.map((sub) => {
              const id = sub.id as string
              const label = sub.name as string
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedCategory(id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    selectedCategory === id
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setSelectedCategory('ingreso.otro')}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                selectedCategory === 'ingreso.otro'
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Otro
            </button>
          </div>

          {selectedCategory && (
            <TransactionFormFields
              amount={amount}
              setAmount={setAmount}
              description={description}
              setDescription={setDescription}
              accountId={accountId}
              setAccountId={setAccountId}
              accounts={debitAccounts}
              onSubmit={handleSubmit}
              onCancel={resetForm}
              isPending={createMut.isPending}
            />
          )}
        </div>
      )}

      {/* Transfer placeholder */}
      {mode === 'transfer' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Transferencias entre cuentas — próximamente</p>
          <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
        </div>
      )}
    </div>
  )
}

function TransactionFormFields({
  amount, setAmount, description, setDescription,
  accountId, setAccountId, accounts, onSubmit, onCancel, isPending,
}: {
  amount: string
  setAmount: (v: string) => void
  description: string
  setDescription: (v: string) => void
  accountId: string
  setAccountId: (v: string) => void
  accounts: Array<{ id: string; name: string }>
  onSubmit: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="text"
            inputMode="numeric"
            placeholder="0"
            className="w-full rounded-sm border border-input bg-background py-2 pl-7 pr-3 font-mono text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
            autoFocus
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="flex-1 rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="flex-1 rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <Button onClick={onSubmit} disabled={isPending || !amount}>
          Registrar
        </Button>
        <Button variant="ghost" onClick={onCancel}>✕</Button>
      </div>
    </div>
  )
}

function ChargesSection({
  charges, open, onToggle,
}: {
  charges: ReturnType<typeof useAutoCharges>
  open: boolean
  onToggle: () => void
}) {
  const cobrados = charges.charges.filter((c) => c.charged)
  const pendientes = charges.charges.filter((c) => !c.charged)
  const progressPct = charges.totalComprometido > 0
    ? Math.round((charges.totalCobrado / charges.totalComprometido) * 100) : 0

  return (
    <div className="rounded-md border border-border/50 bg-muted/20">
      <button type="button" onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{open ? '▾' : '▸'}</span>
          <span className="text-muted-foreground">
            {cobrados.length} cobrado{cobrados.length !== 1 ? 's' : ''} · {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="font-mono text-sm text-muted-foreground">{formatMoney(charges.totalComprometido)}/mes</span>
      </button>
      <div className="px-4 pb-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
      {open && (
        <div className="border-t border-border/50 px-4 py-2 space-y-0.5">
          {pendientes.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pt-1 pb-0.5">Pendiente</p>
              {pendientes.map((c, i) => (
                <div key={`p-${i}`} className="flex items-center justify-between py-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-amber-500/60" />
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">día {c.day}</span>
                  </div>
                  <span className="font-mono">{formatMoney(c.amount)}</span>
                </div>
              ))}
            </>
          )}
          {cobrados.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pt-2 pb-0.5">Cobrado</p>
              {cobrados.map((c, i) => (
                <div key={`c-${i}`} className="flex items-center justify-between py-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span>{c.name}</span>
                    <span className="text-xs">día {c.day}</span>
                  </div>
                  <span className="font-mono line-through">{formatMoney(c.amount)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
