import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/format'
import { useSnapshots } from '@/hooks/use-snapshots'
import { cn } from '@/lib/utils'

type TimeRange = '1y' | '2y' | 'all'

const RANGES: Array<{ key: TimeRange; label: string }> = [
  { key: '1y', label: 'Este año' },
  { key: '2y', label: '2 años' },
  { key: 'all', label: 'Total' },
]

interface ChartDatum {
  label: string
  balance: number
}

function formatDateLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-')
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const monthIndex = parseInt(month ?? '1', 10) - 1
  return `${months[monthIndex]} ${year?.slice(2)}`
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDatum }> }) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null
  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-md">
      <p className="text-sm font-medium">{data.label}</p>
      <p className="mt-1 font-mono text-sm">{formatMoney(data.balance)}</p>
    </div>
  )
}

export function BalanceHistoryChart() {
  const snapshots = useSnapshots(60)
  const [range, setRange] = useState<TimeRange>('1y')

  const filtered = useMemo(() => {
    const all = snapshots.data ?? []
    if (range === 'all') return all
    const now = new Date()
    const years = range === '1y' ? 1 : 2
    const cutoff = new Date(now.getFullYear() - years, now.getMonth(), 1)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return all.filter((s) => s.date >= cutoffStr)
  }, [snapshots.data, range])

  if (snapshots.isLoading) {
    return (
      <div className="rounded-md border border-border bg-card p-4 md:p-5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-4 h-[200px] w-full" />
      </div>
    )
  }

  if (filtered.length < 2) return null

  const chartData: ChartDatum[] = [...filtered]
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((s) => ({
      label: formatDateLabel(s.date),
      balance: s.position ?? 0,
    }))

  return (
    <div className="rounded-md border border-border bg-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold">Balance cuenta personal</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                range === r.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160} className="md:!h-[200px]">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <YAxis
            tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`}
            tick={{ fontSize: 11 }}
            width={45}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#balanceGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
