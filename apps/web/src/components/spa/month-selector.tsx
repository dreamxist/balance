import { Button } from '@/components/ui/button'

interface MonthSelectorProps {
  value: { year: number; month: number }
  onChange: (value: { year: number; month: number }) => void
}

export function MonthSelector({ value, onChange }: MonthSelectorProps) {
  const now = new Date()
  const isCurrentMonth = value.year === now.getFullYear() && value.month === now.getMonth() + 1

  const display = new Date(value.year, value.month - 1)
    .toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  function prev() {
    if (value.month === 1) {
      onChange({ year: value.year - 1, month: 12 })
    } else {
      onChange({ year: value.year, month: value.month - 1 })
    }
  }

  function next() {
    if (isCurrentMonth) return
    if (value.month === 12) {
      onChange({ year: value.year + 1, month: 1 })
    } else {
      onChange({ year: value.year, month: value.month + 1 })
    }
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <Button variant="ghost" size="sm" onClick={prev} className="h-8 w-8 p-0">
        &lt;
      </Button>
      <span className="min-w-[160px] text-center text-sm font-medium capitalize">
        {display}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={next}
        disabled={isCurrentMonth}
        className="h-8 w-8 p-0"
      >
        &gt;
      </Button>
    </div>
  )
}
