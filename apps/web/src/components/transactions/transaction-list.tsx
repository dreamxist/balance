import { useEffect, useRef, useMemo } from 'react'
import type { Transaction } from '@/hooks/use-transactions'
import { useAccounts } from '@/hooks/use-accounts'
import { formatMoney } from '@/lib/format'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  necesidad: 'bg-blue-500',
  consumo: 'bg-orange-500',
  ingreso: 'bg-emerald-500',
  ahorro: 'bg-violet-500',
  deuda: 'bg-red-500',
  transferencia: 'bg-zinc-400',
  apertura: 'bg-zinc-300',
}

function getCategoryColor(category: string | null): string {
  if (!category) return 'bg-zinc-400'
  const lower = category.toLowerCase()
  for (const [key, cls] of Object.entries(CATEGORY_COLORS)) {
    if (lower.startsWith(key)) return cls
  }
  return 'bg-zinc-400'
}

function getCategoryLabel(category: string | null): string {
  if (!category) return ''
  const parts = category.split('.')
  return parts[parts.length - 1]?.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) ?? ''
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const day = String(date.getDate()).padStart(2, '0')
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day} ${months[date.getMonth()]}`
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'income': return '+'
    case 'expense': return '-'
    case 'refund': return '↩'
    case 'transfer': return '→'
    case 'debt_payment': return '⊘'
    case 'adjustment': return '≈'
    default: return ''
  }
}

function getAmountStyle(type: string, amount: number): string {
  switch (type) {
    case 'income': return 'text-emerald-500'
    case 'refund': return 'text-emerald-500'
    case 'transfer': return 'text-muted-foreground'
    case 'debt_payment': return 'text-muted-foreground'
    case 'adjustment': return amount > 0 ? 'text-amber-500' : 'text-amber-500'
    default: return 'text-foreground'
  }
}

interface TransactionListProps {
  transactions: Transaction[]
  isLoading: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  isFetchingNextPage: boolean
  hasFilters: boolean
}

export function TransactionList({
  transactions, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage, hasFilters,
}: TransactionListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const accounts = useAccounts()

  const accountMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts.data ?? []) {
      map.set(a.id, a.name)
    }
    return map
  }, [accounts.data])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasNextPage) fetchNextPage() },
      { threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <div className="divide-y divide-border rounded-md border border-border bg-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center h-12 px-4 gap-4 animate-pulse">
            <div className="w-10 h-3 bg-muted rounded" />
            <div className="flex-1 h-3 bg-muted rounded max-w-[200px]" />
            <div className="w-16 h-3 bg-muted rounded ml-auto" />
          </div>
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="Sin movimientos"
        description={hasFilters ? 'No hay movimientos con estos filtros' : 'Registra tu primer movimiento'}
      />
    )
  }

  // Group by date
  const grouped = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = tx.date
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(tx)
  }

  return (
    <div>
      <div className="rounded-md border border-border bg-card divide-y divide-border">
        {Array.from(grouped.entries()).map(([date, txns]) => (
          <div key={date}>
            <div className="px-4 py-1.5 bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">{formatDate(date)}</span>
            </div>
            {txns.map((tx) => (
              <div key={tx.id} className="flex items-center h-11 px-4 gap-3 hover:bg-muted/50 transition-colors">
                {/* Type icon */}
                <span className={cn('w-4 text-center text-xs font-mono', getAmountStyle(tx.type, tx.amount))}>
                  {getTypeIcon(tx.type)}
                </span>

                {/* Description */}
                <span className="flex-1 text-sm truncate min-w-0">
                  {tx.description || getCategoryLabel(tx.category)}
                </span>

                {/* Category pill */}
                <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <span className={cn('size-1.5 rounded-full', getCategoryColor(tx.category))} />
                  <span className="text-xs text-muted-foreground">{getCategoryLabel(tx.category)}</span>
                </span>

                {/* Account name */}
                <span className="hidden md:block shrink-0 text-xs text-muted-foreground max-w-[6rem] truncate text-right">
                  {accountMap.get(tx.account_id) ?? ''}
                </span>

                {/* Amount */}
                <span className={cn('shrink-0 font-mono text-sm text-right min-w-[90px] tabular-nums', getAmountStyle(tx.type, tx.amount))}>
                  {tx.type === 'income' || tx.type === 'refund' ? '+' : tx.type === 'expense' ? '-' : ''}
                  {formatMoney(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {isFetchingNextPage && (
        <div className="mt-2 text-center text-xs text-muted-foreground">Cargando más...</div>
      )}

      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
