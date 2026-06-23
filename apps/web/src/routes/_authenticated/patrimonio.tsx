import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateAccountBalance } from '@balance/core'
import { EmptyState } from '@/components/ui/empty-state'
import { NetWorthHero } from '@/components/patrimonio/net-worth-hero'
import { TrendChart } from '@/components/patrimonio/trend-chart'
import { DistributionPie } from '@/components/patrimonio/distribution-pie'
import { SnapshotActions } from '@/components/patrimonio/snapshot-actions'
import { useAccounts, type Account } from '@/hooks/use-accounts'
import { useSnapshots } from '@/hooks/use-snapshots'
import { useFintualSync } from '@/hooks/use-fintual'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/patrimonio')({
  component: PatrimonioPage,
})

type FilterKey = 'inversiones' | 'propiedades' | 'spa'
type TimeRange = '1y' | '2y' | '5y' | 'all'

const TIME_LABELS: Record<TimeRange, string> = {
  '1y': '1 año',
  '2y': '2 años',
  '5y': '5 años',
  'all': 'Total',
}

const FILTER_LABELS: Record<FilterKey, string> = {
  inversiones: 'Stocks',
  propiedades: 'Propiedades',
  spa: 'Empresa (SpA)',
}

function PatrimonioPage() {
  const accounts = useAccounts()
  const snapshots = useSnapshots(60)
  const fintual = useFintualSync()
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    inversiones: true,
    propiedades: false,
    spa: true,
  })
  const [timeRange, setTimeRange] = useState<TimeRange>('all')

  const isLoading = accounts.isLoading || snapshots.isLoading
  const hasAccounts = (accounts.data?.length ?? 0) > 0

  const grouped = useMemo(() => {
    const all = accounts.data ?? []
    // Personal categories exclude SpA so company cash never inflates personal líquido.
    const data = all.filter((a) => a.entity === 'personal')

    const liquidAssets = data.filter(
      (a) => a.type === 'asset' && (a.subtype === 'debit' || a.subtype === 'cash' || a.subtype === 'receivable'),
    )
    const liabilities = data.filter((a) => a.type === 'liability')
    const liquidTotal = liquidAssets.reduce((s, a) => s + (a.balance ?? 0), 0)
      - liabilities.reduce((s, a) => s + Math.abs(a.balance ?? 0), 0)

    const investmentAccounts = data.filter((a) => a.subtype === 'investment')
    const investmentTotal = investmentAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)

    const propertyAccounts = data.filter((a) => a.subtype === 'property')
    const propertyTotal = propertyAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)

    // SpA = gross (pre-tax) net worth, its own bucket.
    const spaAccounts = all.filter((a) => a.entity === 'spa')
    const spaTotal = spaAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)

    return {
      liquido: { total: liquidTotal, accounts: [] as Account[] },
      inversiones: { total: investmentTotal, accounts: investmentAccounts },
      propiedades: { total: propertyTotal, accounts: propertyAccounts },
      spa: { total: spaTotal, accounts: spaAccounts },
    }
  }, [accounts.data])

  const filteredTotal = useMemo(() => {
    let total = 0
    if (filters.inversiones) total += grouped.inversiones.total
    if (filters.propiedades) total += grouped.propiedades.total
    if (filters.spa) total += grouped.spa.total
    return total
  }, [grouped, filters])

  const categories = useMemo(() => {
    const safeTotal = filteredTotal !== 0 ? filteredTotal : 1
    const cats: Array<{ key: FilterKey; label: string; amount: number; percentage: number }> = []

    if (filters.inversiones) {
      cats.push({ key: 'inversiones', label: 'Stocks', amount: grouped.inversiones.total, percentage: (grouped.inversiones.total / safeTotal) * 100 })
    }
    if (filters.propiedades) {
      cats.push({ key: 'propiedades', label: 'Propiedades', amount: grouped.propiedades.total, percentage: (grouped.propiedades.total / safeTotal) * 100 })
    }
    if (filters.spa) {
      cats.push({ key: 'spa', label: 'Empresa (SpA)', amount: grouped.spa.total, percentage: (grouped.spa.total / safeTotal) * 100 })
    }
    return cats
  }, [grouped, filters, filteredTotal])

  const filteredSnapshots = useMemo(() => {
    const all = snapshots.data ?? []
    if (timeRange === 'all') return all
    const now = new Date()
    const years = timeRange === '1y' ? 1 : timeRange === '2y' ? 2 : 5
    const cutoff = new Date(now.getFullYear() - years, now.getMonth(), 1)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return all.filter((s) => s.date >= cutoffStr)
  }, [snapshots.data, timeRange])

  const enrichedData = useMemo(() => {
    const snaps = snapshots.data ?? []
    const propertyTotal = grouped.propiedades.total
    const investmentTotal = grouped.inversiones.total
    const spaTotal = grouped.spa.total
    return snaps.map((s) => ({
      date: s.date,
      liquido: 0,
      inversiones: investmentTotal,
      propiedades: propertyTotal,
      spa: spaTotal,
    }))
  }, [snapshots.data, grouped.inversiones.total, grouped.propiedades.total, grouped.spa.total])

  const previousFiltered = useMemo(() => {
    if (!enrichedData || enrichedData.length < 2) return undefined
    const sorted = [...enrichedData].sort((a, b) => (a.date > b.date ? -1 : 1))
    const prev = sorted[1]
    if (!prev) return undefined
    let total = 0
    if (filters.inversiones) total += prev.inversiones
    if (filters.propiedades) total += prev.propiedades
    if (filters.spa) total += prev.spa
    return total
  }, [enrichedData, filters])

  function toggleFilter(key: FilterKey) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!isLoading && !hasAccounts) {
    return <EmptyState title="Patrimonio" description="Agrega cuentas para ver tu patrimonio" />
  }

  return (
    <div className="space-y-6">
      <NetWorthHero
        netWorth={filteredTotal}
        previousNetWorth={previousFiltered}
        isLoading={isLoading}
      />

      {/* Filters + Time range */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFilter(key)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                filters[key]
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex gap-1">
          {(Object.keys(TIME_LABELS) as TimeRange[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimeRange(key)}
              className={cn(
                'rounded-md px-3 py-1 text-sm transition-colors',
                timeRange === key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {TIME_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <TrendChart
        snapshots={filteredSnapshots}
        isLoading={isLoading}
        currentTotal={filteredTotal}
        filters={filters}
        enrichedData={enrichedData}
      />

      {/* Category breakdown + pie chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {categories.map((cat) => (
            <div key={cat.key} className="rounded-md border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{cat.label}</p>
                  <p className="mt-1 font-mono text-2xl font-semibold">{formatMoney(cat.amount)}</p>
                </div>
                <span className="text-lg font-semibold text-muted-foreground">{cat.percentage.toFixed(1)}%</span>
              </div>

              {grouped[cat.key].accounts.length > 0 && (
                <div className="mt-3 space-y-0 border-t border-border pt-2">
                  {grouped[cat.key].accounts.map((acc) => (
                    <AssetAccountRow key={acc.id} account={acc} />
                  ))}
                  {cat.key === 'inversiones' && fintual.lastUpdated && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Fintual actualizado: {fintual.lastUpdated}
                      {fintual.isLoading && ' (actualizando...)'}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center rounded-md border border-border bg-card p-5">
          <DistributionPie
            items={(() => {
              const CATEGORY_COLORS: Record<FilterKey, string> = {
                inversiones: '#8b5cf6',
                propiedades: '#f59e0b',
                spa: '#10b981',
              }
              // More than one category active: one segment per category (incl. SpA)
              if (categories.length > 1) {
                return categories.map((cat) => ({
                  label: cat.label,
                  amount: cat.amount,
                  percentage: cat.percentage,
                  color: CATEGORY_COLORS[cat.key],
                }))
              }
              // Exactly one category active: internal breakdown
              const only = categories[0]
              if (!only) return []
              if (only.key === 'spa') {
                return grouped.spa.accounts.map((acc, i) => {
                  const total = grouped.spa.total || 1
                  const colors = ['#10b981', '#34d399', '#059669', '#6ee7b7']
                  return {
                    label: acc.name,
                    amount: acc.balance ?? 0,
                    percentage: ((acc.balance ?? 0) / total) * 100,
                    color: colors[i % colors.length]!,
                  }
                })
              }
              const accounts = grouped[only.key].accounts
              const total = grouped[only.key].total || 1
              const palette = only.key === 'inversiones'
                ? ['#8b5cf6', '#a78bfa', '#7c3aed', '#c4b5fd']
                : ['#f59e0b', '#fbbf24', '#d97706', '#fcd34d']
              return accounts.map((acc, i) => ({
                label: only.key === 'inversiones' ? acc.name.replace('Fintual ', '') : acc.name,
                amount: acc.balance ?? 0,
                percentage: ((acc.balance ?? 0) / total) * 100,
                color: palette[i % palette.length]!,
              }))
            })()}
          />
        </div>
      </div>

      <SnapshotActions />
    </div>
  )
}

function AssetAccountRow({ account }: { account: Account }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const mut = useMutation({
    mutationFn: (balance: number) => updateAccountBalance(supabase, account.id, balance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      setAdding(false)
      setNewValue('')
      toast.success(`${account.name} actualizado`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div>
      <div className="flex items-center justify-between rounded-sm px-1 py-1">
        <span className="text-sm">{account.name}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{formatMoney(account.balance ?? 0)}</span>
          <button
            type="button"
            onClick={() => setAdding(!adding)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {adding ? '✕' : '+ Registro'}
          </button>
        </div>
      </div>

      {adding && (
        <form
          className="flex items-center gap-2 rounded-sm bg-muted/50 px-2 py-2 mb-1"
          onSubmit={(e) => {
            e.preventDefault()
            const val = parseInt(newValue, 10)
            if (!isNaN(val)) mut.mutate(val)
          }}
        >
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            type="date"
            className="w-32 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            type="number"
            placeholder="Nuevo valor total"
            className="flex-1 rounded-sm border border-input bg-background px-2 py-1 text-right font-mono text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={mut.isPending || !newValue}
            className="rounded-sm bg-foreground px-3 py-1 text-xs text-background disabled:opacity-50"
          >
            Guardar
          </button>
        </form>
      )}
    </div>
  )
}
