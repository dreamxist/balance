import { formatMoney } from '@/lib/format'

interface ProfitSummaryProps {
  profit: number
  year: number
}

const PROFIT_GOAL = 8_000_000

export function ProfitSummary({ profit, year }: ProfitSummaryProps) {
  const pct = Math.max(0, Math.min(100, (profit / PROFIT_GOAL) * 100))

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-muted-foreground">
        Utilidades acumuladas {year}
      </h3>

      <p className="text-2xl font-mono font-semibold">{formatMoney(profit)}</p>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Meta: {formatMoney(PROFIT_GOAL)}
      </p>
    </div>
  )
}
