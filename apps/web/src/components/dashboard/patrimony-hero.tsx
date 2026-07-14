import type { MonthlyBuckets } from '@balance/core'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { computeDistribution } from '@/lib/distribution'
import { SkeletonCard } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/ui/animated-number'

interface PatrimonyHeroProps {
  position: number
  monthly?: MonthlyBuckets
  isLoading: boolean
  className?: string
}

const SEGMENT_COLORS = {
  necesidades: 'bg-blue-500',
  consumo: 'bg-orange-500',
  ahorro: 'bg-violet-500',
  por_categorizar: 'bg-zinc-400',
  disponible: 'bg-emerald-500',
} as const

const SEGMENT_LABELS = {
  necesidades: 'Necesidades',
  consumo: 'Consumo',
  ahorro: 'Ahorro',
  por_categorizar: 'Por categorizar',
  disponible: 'Disponible',
} as const

export function PatrimonyHero({ position, monthly, isLoading, className }: PatrimonyHeroProps) {
  if (isLoading) {
    return <SkeletonCard className={cn('col-span-1 lg:col-span-3', className)} />
  }

  const income = monthly?.income ?? 0
  const disponible = monthly?.disponible ?? 0
  const segments = monthly ? computeDistribution(monthly) : []

  return (
    <div
      className={cn(
        'col-span-1 rounded-md border border-border bg-card p-4 md:p-5 lg:col-span-3',
        className,
      )}
    >
      <div className="mt-1 flex items-baseline gap-3">
        <p className="text-3xl font-bold text-foreground md:text-4xl">
          <AnimatedNumber value={position} className="text-3xl font-bold md:text-4xl" />
        </p>
        {income > 0 && (
          <span className={cn(
            'text-sm font-medium',
            disponible >= 0 ? 'text-emerald-500' : 'text-red-500',
          )}>
            {formatMoney(disponible)} disponible
          </span>
        )}
      </div>

      {income > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {segments.map((s) => (
              s.pct > 0 && (
                <div key={s.key} className={SEGMENT_COLORS[s.key]} style={{ width: `${s.pct}%` }} />
              )
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {segments.map((s) => {
              // Hide the neutral bucket when empty; the rest stay as fixed legend
              if (s.key === 'por_categorizar' && s.amount === 0) return null
              const isNegativeDisponible = s.key === 'disponible' && s.amount < 0
              return (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', SEGMENT_COLORS[s.key])} />
                  <span className={cn(isNegativeDisponible && 'text-red-500')}>
                    {SEGMENT_LABELS[s.key]} {formatMoney(s.amount)}
                    {!isNegativeDisponible && ` · ${s.pct}%`}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
