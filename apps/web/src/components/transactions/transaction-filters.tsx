import type { TransactionFilters } from '@/hooks/use-transactions'
import { useAccounts } from '@/hooks/use-accounts'
import { cn } from '@/lib/utils'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const CATEGORY_FILTERS = [
  { value: 'necesidad', label: 'Necesidades', color: 'bg-blue-500' },
  { value: 'consumo', label: 'Consumo', color: 'bg-orange-500' },
  { value: 'ingreso', label: 'Ingresos', color: 'bg-emerald-500' },
  { value: 'ahorro', label: 'Ahorro', color: 'bg-violet-500' },
] as const

const TYPE_FILTERS = [
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'internal', label: 'Internos' },
] as const

function parseMonth(month: string): { year: number; month: number } {
  const parts = month.split('-')
  return { year: Number(parts[0]), month: Number(parts[1]) }
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

interface TransactionFiltersProps {
  filters: TransactionFilters
  onFiltersChange: (filters: TransactionFilters) => void
}

export function TransactionFiltersBar({ filters, onFiltersChange }: TransactionFiltersProps) {
  const { data: accounts } = useAccounts()
  const parsed = filters.month ? parseMonth(filters.month) : null

  const activeAccounts = (accounts ?? []).filter((a) => !a.is_archived && a.on_budget && a.subtype !== 'receivable' && a.subtype !== 'payable')

  function navigateMonth(direction: -1 | 1) {
    if (!parsed) return
    let newMonth = parsed.month + direction
    let newYear = parsed.year
    if (newMonth < 1) { newMonth = 12; newYear -= 1 }
    else if (newMonth > 12) { newMonth = 1; newYear += 1 }
    onFiltersChange({ ...filters, month: formatMonth(newYear, newMonth) })
  }

  function toggleCategory(cat: string) {
    onFiltersChange({ ...filters, category: filters.category === cat ? undefined : cat })
  }

  function toggleType(type: string) {
    if (filters.type === type) {
      onFiltersChange({ ...filters, type: undefined })
    } else {
      onFiltersChange({ ...filters, type })
    }
  }

  const monthLabel = parsed ? `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}` : ''

  return (
    <div className="space-y-3">
      {/* Month nav + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => navigateMonth(-1)}
            className="flex size-9 items-center justify-center rounded-md text-base text-muted-foreground hover:bg-muted transition-colors">
            ‹
          </button>
          <span className="min-w-[110px] text-center text-sm font-medium">{monthLabel}</span>
          <button type="button" onClick={() => navigateMonth(1)}
            className="flex size-9 items-center justify-center rounded-md text-base text-muted-foreground hover:bg-muted transition-colors">
            ›
          </button>
        </div>

        <div className="flex flex-1 gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={filters.search ?? ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            className="h-10 flex-1 border border-input rounded-md px-3 text-base bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:max-w-[200px] md:text-sm"
          />

          <select
            value={filters.accountId ?? ''}
            onChange={(e) => onFiltersChange({ ...filters, accountId: e.target.value || undefined })}
            className="h-10 flex-1 border border-input rounded-md px-3 text-base bg-background sm:flex-initial md:text-sm"
          >
            <option value="">Todas</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category + type pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide sm:flex-wrap">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => toggleCategory(cat.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              filters.category === cat.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('size-1.5 rounded-full', cat.color)} />
            {cat.label}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {TYPE_FILTERS.map((t) => {
          const isActive = filters.type === t.value
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => toggleType(t.value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
