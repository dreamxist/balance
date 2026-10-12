import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCategorizationRule, setTransactionCategory } from '@balance/core'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useCategories } from '@/hooks/use-categories'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface CategorizableTx {
  id: string
  description: string
  amount: number
  type: string
  category: string | null
}

const GROUPS = [
  { key: 'necesidad', label: 'Necesidades', color: 'bg-blue-500' },
  { key: 'consumo', label: 'Consumo', color: 'bg-orange-500' },
  { key: 'ahorro', label: 'Ahorro', color: 'bg-violet-500' },
] as const

/** Display name of a category id, falling back to its last segment. */
export function useCategoryName(): (id: string) => string {
  const categories = useCategories()
  const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]))
  return (id) => {
    const name = names.get(id)
    if (name) return name
    const leaf = id.split('.').pop() ?? id
    return leaf.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  }
}

export function isCategorizable(type: string): boolean {
  return type === 'expense' || type === 'refund' || type === 'income'
}

export function CategorySheet({ tx, onClose }: { tx: CategorizableTx | null; onClose: () => void }) {
  return (
    <BottomSheet open={tx !== null} onOpenChange={(open) => { if (!open) onClose() }} title="Categoría">
      {tx && <CategoryPicker key={tx.id} tx={tx} onDone={onClose} />}
    </BottomSheet>
  )
}

function CategoryPicker({ tx, onDone }: { tx: CategorizableTx; onDone: () => void }) {
  const queryClient = useQueryClient()
  const categories = useCategories()
  const isIncome = tx.type === 'income'
  const currentRoot = tx.category?.split('.')[0] ?? null
  const [group, setGroup] = useState<string | null>(
    isIncome ? 'ingreso' : GROUPS.some((g) => g.key === currentRoot) ? currentRoot : null,
  )
  const [remember, setRemember] = useState(false)

  const subcategories = (categories.data ?? []).filter(
    (c) => group !== null && c.id.startsWith(`${group}.`),
  )

  const save = useMutation({
    mutationFn: async (category: string) => {
      await setTransactionCategory(supabase, tx.id, category)
      if (remember) {
        await createCategorizationRule(supabase, { pattern: tx.description.toUpperCase(), category })
      }
    },
    onSuccess: () => {
      for (const key of ['transactions', 'monthly-breakdown', 'inbox']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(remember ? 'Categoría guardada y recordada' : 'Categoría guardada')
      onDone()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm">{tx.description}</p>
        <p className="shrink-0 font-mono text-sm tabular-nums">{formatMoney(tx.amount)}</p>
      </div>

      {!isIncome && (
        <div className="flex gap-2">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={cn(
                'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                group === g.key ? `${g.color} text-white` : 'bg-muted text-muted-foreground',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {group && (
        <div className="flex flex-wrap gap-2">
          {subcategories.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(c.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50',
                tx.category === c.id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {!isIncome && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-foreground"
          />
          Recordar para las próximas compras en “{tx.description}”
        </label>
      )}
    </div>
  )
}
