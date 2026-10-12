import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { SyncSourceStatus } from '@balance/core'
import { useRecentTransactions, useSyncStatus } from '@/hooks/use-freshness'
import { SourceBadge } from '@/components/transactions/source-badge'
import { CategorySheet, isCategorizable, useCategoryName, type CategorizableTx } from '@/components/transactions/category-sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { SyncButton } from '@/components/sync-button'
import { formatDateTime, formatHoursAgo, formatMoney, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const RECENT_LIMIT = 6

const SOURCE_LABEL: Record<SyncSourceStatus['source'], string> = { gmail: 'Gmail', fintoc: 'Fintoc' }

const STATUS_DOT: Record<SyncSourceStatus['status'], string> = {
  ok: 'bg-emerald-500',
  stale: 'bg-amber-500',
  failing: 'bg-red-500',
}

export function FreshnessCard({ className }: { className?: string }) {
  const sync = useSyncStatus()
  const recent = useRecentTransactions(RECENT_LIMIT)

  const [editing, setEditing] = useState<CategorizableTx | null>(null)
  const categoryLabel = useCategoryName()
  const latest = recent.data?.[0]
  // Fintoc is out of the daily flow (Apple Pay + Gmail cover the cards); its
  // stale link would only add noise here.
  const sources = (sync.data ?? []).filter((s) => s.source !== 'fintoc')
  const needsAttention = sources.some((s) => s.status !== 'ok')

  return (
    <section className={cn('rounded-md border border-border bg-card p-4 md:p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm text-muted-foreground">Al día</h2>
          {latest && (
            <p className="text-xs text-muted-foreground">
              Último movimiento <span className="font-medium text-foreground">{formatShortDate(latest.date)}</span>
            </p>
          )}
        </div>
        <SyncButton variant="ghost" />
      </div>

      <div className="mt-3 space-y-1.5">
        {sync.isLoading ? (
          <Skeleton className="h-5 w-48" />
        ) : sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin sincronización automática configurada</p>
        ) : (
          sources.map((s) => <SourceRow key={s.source} status={s} />)
        )}
        {needsAttention && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Los saldos pueden estar incompletos hasta que vuelva a sincronizar.
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-2">
        {recent.isLoading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (recent.data ?? []).length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Sin movimientos todavía</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.data?.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  disabled={!isCategorizable(tx.type)}
                  onClick={() => setEditing(tx)}
                  className="flex w-full items-center gap-3 py-2 text-left disabled:cursor-default"
                >
                  <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatShortDate(tx.date)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{tx.description}</span>
                    {isCategorizable(tx.type) && (
                      <span className={cn('block truncate text-xs', tx.category ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
                        {tx.category ? categoryLabel(tx.category) : 'Sin categoría · tocar para elegir'}
                      </span>
                    )}
                  </span>
                  <SourceBadge metadata={tx.metadata} className="max-sm:hidden" />
                  <span
                    className={cn(
                      'shrink-0 font-mono text-sm tabular-nums',
                      tx.type === 'income' || tx.type === 'refund'
                        ? 'text-emerald-500'
                        : tx.type === 'expense'
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {tx.type === 'income' || tx.type === 'refund' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {formatMoney(tx.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/movimientos"
          className="mt-1 inline-block py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Ver todos los movimientos →
        </Link>
      </div>
      <CategorySheet tx={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

function SourceRow({ status }: { status: SyncSourceStatus }) {
  const when = status.lastSuccessAt && status.hoursSinceSuccess !== null
    ? `${formatHoursAgo(status.hoursSinceSuccess)} · ${formatDateTime(status.lastSuccessAt)}`
    : 'nunca sincronizó bien'

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status.status])} />
        <span className="font-medium">{SOURCE_LABEL[status.source]}</span>
        <span className="text-muted-foreground">{when}</span>
      </div>
      {status.error && (
        <p className="mt-0.5 truncate pl-3.5 text-red-500" title={status.error}>
          {status.error}
        </p>
      )}
    </div>
  )
}
