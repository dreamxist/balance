import { useState, useRef, type FormEvent } from 'react'
import { useCategories, type Category } from '@/hooks/use-categories'
import { useAccounts } from '@/hooks/use-accounts'
import { useCreateTransaction } from '@/hooks/use-create-transaction'

type TransactionType = 'expense' | 'income' | 'refund'

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'refund', label: 'Devolucion' },
]

function formatWithThousands(value: number): string {
  return value.toLocaleString('es-CL')
}

function parseAmount(raw: string): number {
  return parseInt(raw.replace(/\./g, '').replace(/,/g, ''), 10) || 0
}

function groupCategoriesByParent(categories: Category[]) {
  const parents = categories.filter((c) => c.parent_id === null)
  const children = categories.filter((c) => c.parent_id !== null)

  return parents.map((parent) => ({
    parent,
    subcategories: children.filter((c) => c.parent_id === parent.id),
  }))
}

export function QuickTransactionForm() {
  const [type, setType] = useState<TransactionType>('expense')
  const [amountDisplay, setAmountDisplay] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const amountRef = useRef<HTMLInputElement>(null)

  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const mutation = useCreateTransaction()

  const grouped = groupCategoriesByParent(categories)
  const activeAccounts = accounts.filter((a) => !a.is_archived)

  function handleAmountFocus() {
    const raw = parseAmount(amountDisplay)
    setAmountDisplay(raw > 0 ? String(raw) : '')
  }

  function handleAmountBlur() {
    const raw = parseAmount(amountDisplay)
    if (raw > 0) {
      setAmountDisplay(formatWithThousands(raw))
    }
    setTouched((prev) => ({ ...prev, amount: true }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const rawAmount = parseAmount(amountDisplay)

    if (rawAmount <= 0 || !categoryId || !accountId) {
      setTouched({ amount: true, category: true, account: true })
      return
    }

    const signedAmount = type === 'expense' ? -rawAmount : rawAmount

    mutation.mutate(
      {
        amount: signedAmount,
        category: categoryId,
        accountId,
        description: description.trim(),
        type,
        date: date || undefined,
      },
      {
        onSuccess: () => {
          setAmountDisplay('')
          setDescription('')
          setDate('')
          setTouched({})
          amountRef.current?.focus()
        },
      },
    )
  }

  const amountInvalid = touched.amount && parseAmount(amountDisplay) <= 0
  const categoryInvalid = touched.category && !categoryId
  const accountInvalid = touched.account && !accountId

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border pt-4 mt-4 space-y-3"
    >
      <div className="flex gap-1">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setType(opt.value)}
            className={`rounded-full text-sm px-3 py-1 transition-colors ${
              type === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <label htmlFor="qtf-amount" className="text-xs text-muted-foreground">
            Monto
          </label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">
              $
            </span>
            <input
              ref={amountRef}
              id="qtf-amount"
              type="text"
              inputMode="numeric"
              value={amountDisplay}
              onChange={(e) => setAmountDisplay(e.target.value)}
              onFocus={handleAmountFocus}
              onBlur={handleAmountBlur}
              placeholder="0"
              className={`pl-6 pr-2 py-2 w-36 rounded-sm border font-mono text-sm ${
                amountInvalid
                  ? 'border-red-500'
                  : 'border-input'
              } bg-background`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="qtf-category" className="text-xs text-muted-foreground">
            Categoria
          </label>
          <select
            id="qtf-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, category: true }))}
            className={`py-2 px-2 rounded-sm border text-sm min-w-40 ${
              categoryInvalid
                ? 'border-red-500'
                : 'border-input'
            } bg-background`}
          >
            <option value="">Seleccionar...</option>
            {grouped.map((group) => (
              <optgroup key={group.parent.id} label={group.parent.name}>
                {group.subcategories.length > 0 ? (
                  group.subcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))
                ) : (
                  <option value={group.parent.id}>{group.parent.name}</option>
                )}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="qtf-account" className="text-xs text-muted-foreground">
            Cuenta
          </label>
          <select
            id="qtf-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, account: true }))}
            className={`py-2 px-2 rounded-sm border text-sm min-w-40 ${
              accountInvalid
                ? 'border-red-500'
                : 'border-input'
            } bg-background`}
          >
            <option value="">Seleccionar...</option>
            {activeAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="qtf-desc" className="text-xs text-muted-foreground">
            Descripcion
          </label>
          <input
            id="qtf-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripcion..."
            className="py-2 px-2 rounded-sm border border-input text-sm min-w-48 bg-background"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="qtf-date" className="text-xs text-muted-foreground">
            Fecha
          </label>
          <input
            id="qtf-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="py-2 px-2 rounded-sm border border-input text-sm bg-background"
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="bg-primary text-primary-foreground rounded-sm px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {mutation.isPending ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </form>
  )
}
