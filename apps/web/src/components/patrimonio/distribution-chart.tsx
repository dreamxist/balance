import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { formatMoney } from '@/lib/format'

interface DistributionItem {
  label: string
  amount: number
  percentage: number
  color: string
}

interface DistributionChartProps {
  items: DistributionItem[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DistributionItem }> }) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-md">
      <p className="text-sm font-medium">{data.label}</p>
      <p className="mt-1 font-mono text-sm">{formatMoney(data.amount)}</p>
      <p className="text-xs text-muted-foreground">{data.percentage.toFixed(1)}%</p>
    </div>
  )
}

export function DistributionChart({ items }: DistributionChartProps) {
  if (items.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-card p-4 md:p-5">
      <p className="mb-4 text-lg font-semibold">Distribución</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={items} layout="vertical" barSize={28}>
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}M`}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 13 }}
            width={80}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
            {items.map((item) => (
              <Cell key={item.label} fill={item.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
