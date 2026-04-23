import { SkeletonCard } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/format'

interface Category {
  label: string
  amount: number
  percentage: number
}

interface CategoryBreakdownProps {
  categories: Category[]
  isLoading: boolean
}

export function CategoryBreakdown({ categories, isLoading }: CategoryBreakdownProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {categories.map((cat) => (
        <div key={cat.label} className="rounded-md border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">{cat.label}</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{formatMoney(cat.amount)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{cat.percentage.toFixed(1)}%</p>
        </div>
      ))}
    </div>
  )
}
