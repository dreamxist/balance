import { useMonthlySummary } from '@/hooks/use-monthly-summary'
import { formatMoney } from '@/lib/format'

interface MonthlySummaryProps {
  month: string
}

function SummaryRow({
  label,
  amount,
  barPercent,
  barColor,
  amountColor,
}: {
  label: string
  amount: number
  barPercent?: number
  barColor?: string
  amountColor?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-[4.5rem] text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`min-w-[6rem] text-right font-mono text-sm shrink-0 ${amountColor ?? ''}`}>
        {formatMoney(amount)}
      </span>
      {barPercent !== undefined && (
        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor ?? ''}`}
            style={{ width: `${Math.min(barPercent, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="min-w-[4.5rem] h-4 bg-muted rounded animate-pulse" />
          <div className="min-w-[6rem] h-4 bg-muted rounded animate-pulse" />
          {i < 2 && <div className="flex-1 h-3 bg-muted rounded-full animate-pulse" />}
        </div>
      ))}
    </div>
  )
}

export function MonthlySummary({ month }: MonthlySummaryProps) {
  const { data, isLoading } = useMonthlySummary(month)

  if (isLoading) {
    return (
      <div className="border border-border rounded-md p-5 bg-card">
        <SkeletonRows />
      </div>
    )
  }

  if (!data || data.txCount === 0) {
    return (
      <div className="border border-border rounded-md p-5 bg-card">
        <p className="text-sm text-muted-foreground text-center">Sin movimientos este mes</p>
      </div>
    )
  }

  const absExpenses = Math.abs(data.expenses)
  const maxAmount = Math.max(data.income, absExpenses)
  const incomePercent = maxAmount > 0 ? (data.income / maxAmount) * 100 : 0
  const expensesPercent = maxAmount > 0 ? (absExpenses / maxAmount) * 100 : 0

  const balanceColor = data.net > 0
    ? 'text-green-600'
    : data.net < 0
      ? 'text-red-600'
      : 'text-muted-foreground'

  return (
    <div className="border border-border rounded-md p-5 bg-card space-y-3">
      <SummaryRow
        label="Ingresos"
        amount={data.income}
        barPercent={incomePercent}
        barColor="bg-green-500"
        amountColor="text-green-600"
      />
      <SummaryRow
        label="Gastos"
        amount={data.expenses}
        barPercent={expensesPercent}
        barColor="bg-red-500"
        amountColor="text-red-600"
      />
      <SummaryRow
        label="Balance"
        amount={data.net}
        amountColor={balanceColor}
      />
    </div>
  )
}
