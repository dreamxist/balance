import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatMoney } from '@/lib/format'

interface PieItem {
  label: string
  amount: number
  percentage: number
  color: string
}

interface DistributionPieProps {
  items: PieItem[]
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PieItem }> }) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{data.label}</p>
      <p className="font-mono text-sm">{formatMoney(data.amount)}</p>
      <p className="text-xs text-muted-foreground">{data.percentage.toFixed(1)}%</p>
    </div>
  )
}

export function DistributionPie({ items }: DistributionPieProps) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            dataKey="amount"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
            strokeWidth={2}
            stroke="var(--color-card)"
          >
            {items.map((item) => (
              <Cell key={item.label} fill={item.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span className="size-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-mono font-medium">{item.percentage.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
