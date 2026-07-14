import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCategorizationRule,
  discardEmailMovement,
  setTransactionCategory,
  type EmailMovement,
  type UncategorizedTransaction,
} from '@balance/core'
import { useEmailMovements, useUncategorizedTransactions } from '@/hooks/use-inbox'
import { useCategories } from '@/hooks/use-categories'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const GASTO_GROUPS = [
  { key: 'necesidad', label: 'Necesidades', color: 'bg-blue-500' },
  { key: 'consumo', label: 'Consumo', color: 'bg-orange-500' },
  { key: 'ahorro', label: 'Ahorro', color: 'bg-violet-500' },
] as const

export function PorCategorizarPanel() {
  const transactions = useUncategorizedTransactions()
  const staging = useEmailMovements()

  const txRows = transactions.data ?? []
  const stagingRows = staging.data ?? []
  const total = txRows.length + stagingRows.length

  if (transactions.isLoading || staging.isLoading || total === 0) return null

  return (
    <div className="rounded-md border border-amber-500/40 bg-card">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <h2 className="text-sm font-semibold">
          Por categorizar
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
            {total}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-border/50">
        {txRows.map((tx) => (
          <UncategorizedRow key={tx.id} tx={tx} />
        ))}
        {stagingRows.map((row) => (
          <StagingRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  )
}

function UncategorizedRow({ tx }: { tx: UncategorizedTransaction }) {
  const queryClient = useQueryClient()
  const categories = useCategories()
  const [open, setOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [rememberRule, setRememberRule] = useState(false)

  const isIncome = tx.type === 'income'
  const allCats = categories.data ?? []

  function subcategoriesOf(parentKey: string) {
    return allCats.filter((c) => c.id.startsWith(`${parentKey}.`) && c.id !== parentKey)
  }

  const assignMut = useMutation({
    mutationFn: async () => {
      await setTransactionCategory(supabase, tx.id, selectedCategory)
      if (rememberRule && !isIncome) {
        await createCategorizationRule(supabase, {
          pattern: tx.description.toUpperCase(),
          category: selectedCategory,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-breakdown'] })
      toast.success(rememberRule ? 'Categorizado y regla guardada' : 'Categorizado')
    },
    onError: (e) => {
      console.error('setTransactionCategory failed', e)
      toast.error(e.message)
    },
  })

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0">
          <p className="truncate text-sm">
            {tx.description}
            {isIncome && (
              <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                Ingreso
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{tx.date}</p>
        </div>
        <span className={cn(
          'font-mono text-sm tabular-nums',
          isIncome ? 'text-emerald-500' : 'text-foreground',
        )}>
          {isIncome ? '+' : '-'}{formatMoney(Math.abs(tx.amount))}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {isIncome ? (
            <div className="flex flex-wrap gap-1.5">
              {subcategoriesOf('ingreso').map((sub) => (
                <CategoryPill
                  key={sub.id}
                  id={sub.id}
                  label={sub.name}
                  selected={selectedCategory === sub.id}
                  onSelect={setSelectedCategory}
                  selectedClass="bg-emerald-500 border-emerald-500 text-white"
                />
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {GASTO_GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => { setSelectedGroup(g.key); setSelectedCategory('') }}
                    className={cn(
                      'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                      selectedGroup === g.key
                        ? `${g.color} text-white`
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              {selectedGroup && (
                <div className="flex flex-wrap gap-1.5">
                  {subcategoriesOf(selectedGroup).map((sub) => (
                    <CategoryPill
                      key={sub.id}
                      id={sub.id}
                      label={sub.name}
                      selected={selectedCategory === sub.id}
                      onSelect={setSelectedCategory}
                      selectedClass="border-foreground bg-foreground text-background"
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {selectedCategory && (
            <div className="flex items-center justify-between gap-3 pt-1">
              {!isIncome ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rememberRule}
                    onChange={(e) => setRememberRule(e.target.checked)}
                    className="size-3.5 accent-foreground"
                  />
                  Recordar regla para “{tx.description}”
                </label>
              ) : <span />}
              <Button
                size="sm"
                disabled={assignMut.isPending}
                onClick={() => assignMut.mutate()}
              >
                Confirmar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CategoryPill({ id, label, selected, onSelect, selectedClass }: {
  id: string
  label: string
  selected: boolean
  onSelect: (id: string) => void
  selectedClass: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        selected ? selectedClass : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

function StagingRow({ row }: { row: EmailMovement }) {
  const queryClient = useQueryClient()
  // Discarding is irreversible from the UI: require a second, explicit click.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const discardMut = useMutation({
    mutationFn: () => discardEmailMovement(supabase, row.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] })
      toast.success('Movimiento descartado')
    },
    onError: (e) => {
      console.error('discardEmailMovement failed', e)
      toast.error(e.message)
    },
  })

  const isError = row.status === 'error'

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {row.merchant ?? row.counterparty ?? row.source}
          <span className={cn(
            'ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium',
            isError ? 'bg-red-500/15 text-red-600' : 'bg-amber-500/15 text-amber-600',
          )}>
            {isError ? 'Error' : 'Pendiente'}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {isError ? row.error_detail ?? 'sin detalle' : 'esperando promoción (correo bancario)'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.amount !== null && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {row.currency === 'USD' ? `US$${(row.amount / 100).toFixed(2)}` : formatMoney(row.amount)}
          </span>
        )}
        <Button
          variant={confirmingDiscard ? 'destructive' : 'ghost'}
          size="sm"
          aria-label={confirmingDiscard ? 'Confirmar descarte' : 'Descartar movimiento'}
          disabled={discardMut.isPending}
          onBlur={() => setConfirmingDiscard(false)}
          onClick={() => {
            if (confirmingDiscard) discardMut.mutate()
            else setConfirmingDiscard(true)
          }}
        >
          {confirmingDiscard ? '¿Descartar?' : '✕'}
        </Button>
      </div>
    </div>
  )
}
