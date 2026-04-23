import { formatMoney } from '@/lib/format'
import type { SpaExpense } from '@/hooks/use-spa'

interface SpaExpensesProps {
  expenses: SpaExpense[]
}

export function SpaExpenses({ expenses }: SpaExpensesProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Gastos empresa</h3>

      {expenses.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Sin gastos registrados</p>
      ) : (
        <div className="space-y-1">
          {expenses.map((expense) => {
            const dateStr = new Date(expense.date).toLocaleDateString('es-CL', {
              day: 'numeric',
              month: 'short',
            })
            return (
              <div key={expense.id} className="flex items-center justify-between rounded-md px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{expense.description}</p>
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                </div>
                <span className="font-mono text-sm text-red-600">{formatMoney(expense.amount)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
