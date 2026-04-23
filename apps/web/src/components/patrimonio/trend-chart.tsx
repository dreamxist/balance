import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/format'
import type { Snapshot } from '@/hooks/use-snapshots'

interface FilterState {
  liquido?: boolean
  inversiones: boolean
  propiedades: boolean
}

interface EnrichedSnapshot {
  date: string
  liquido: number
  inversiones: number
  propiedades: number
}

interface TrendChartProps {
  snapshots: Snapshot[]
  isLoading: boolean
  currentTotal?: number
  filters?: FilterState
  enrichedData?: EnrichedSnapshot[]
}

interface ChartDatum {
  date: string
  label: string
  netWorth: number
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
      <p className="mt-1 text-sm">
        <span className="text-muted-foreground">Patrimonio: </span>
        <span className="font-mono">{formatMoney(data.netWorth)}</span>
      </p>
    </div>
  )
}

export function TrendChart({ snapshots, isLoading, currentTotal, filters, enrichedData }: TrendChartProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border border-border bg-card p-4 md:p-5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-4 h-[200px] w-full md:h-[300px]" />
      </div>
    )
  }

  if (snapshots.length < 2) {
    return (
      <div className="rounded-md border border-border bg-card p-4 md:p-5">
        <p className="text-lg font-semibold">Tendencia histórica</p>
        <div className="flex h-[200px] items-center justify-center md:h-[300px]">
          <p className="text-sm text-muted-foreground">
            Necesitas al menos 2 snapshots para ver la tendencia
          </p>
        </div>
      </div>
    )
  }

  const f = filters ?? { liquido: true, inversiones: true, propiedades: true }

  const chartData: ChartDatum[] = [...snapshots]
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((s) => {
      const enriched = enrichedData?.find((e) => e.date === s.date)
      if (enriched) {
        let value = 0
        if (f.liquido) value += enriched.liquido
        if (f.inversiones) value += enriched.inversiones
        if (f.propiedades) value += enriched.propiedades
        return { date: s.date, label: formatDateLabel(s.date), netWorth: value }
      }
      return { date: s.date, label: formatDateLabel(s.date), netWorth: s.net_worth ?? 0 }
    })

  if (currentTotal !== undefined) {
    const last = chartData[chartData.length - 1]
    if (last) {
      last.netWorth = currentTotal
      last.label = 'Hoy'
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 md:p-5">
      <p className="mb-4 text-lg font-semibold">Tendencia histórica</p>
      <ResponsiveContainer width="100%" height={200} className="md:!h-[300px]">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="oklch(0.6 0.2 145)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="oklch(0.6 0.2 145)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
          <YAxis
            tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}M`}
            tick={{ fontSize: 12 }}
            width={50}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="oklch(0.6 0.2 145)"
            strokeWidth={2}
            fill="url(#netWorthGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
