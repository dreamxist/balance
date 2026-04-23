import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { SkeletonCard } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/ui/animated-number'

interface MonthlyBreakdown {
  income: number
  necesidades: number
  consumo: number
  ahorro: number
  delta: number
}

interface PatrimonyHeroProps {
  position: number
  monthly?: MonthlyBreakdown
  isLoading: boolean
  className?: string
}

export function PatrimonyHero({ position, monthly, isLoading, className }: PatrimonyHeroProps) {
  if (isLoading) {
    return <SkeletonCard className={cn('col-span-1 lg:col-span-3', className)} />
  }

  const income = monthly?.income ?? 0
  const necesidades = monthly?.necesidades ?? 0
  const consumo = monthly?.consumo ?? 0
  const ahorro = monthly?.ahorro ?? 0
  const delta = monthly?.delta ?? 0

  const gastado = necesidades + consumo + ahorro
  const total = gastado + Math.max(delta, 0)
  const pctNecesidades = total > 0 ? Math.round((necesidades / total) * 100) : 0
  const pctConsumo = total > 0 ? Math.round((consumo / total) * 100) : 0
  const pctAhorro = total > 0 ? Math.round((ahorro / total) * 100) : 0
  const pctDelta = total > 0 ? Math.round((Math.max(delta, 0) / total) * 100) : 0

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
            delta >= 0 ? 'text-emerald-500' : 'text-red-500',
          )}>
            {formatMoney(delta)} disponible
          </span>
        )}
      </div>

      {income > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {pctNecesidades > 0 && (
              <div className="bg-blue-500" style={{ width: `${pctNecesidades}%` }} />
            )}
            {pctConsumo > 0 && (
              <div className="bg-orange-500" style={{ width: `${pctConsumo}%` }} />
            )}
            {pctAhorro > 0 && (
              <div className="bg-violet-500" style={{ width: `${pctAhorro}%` }} />
            )}
            {pctDelta > 0 && (
              <div className="bg-emerald-500" style={{ width: `${pctDelta}%` }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-500" />
              Necesidades {formatMoney(necesidades)} · {pctNecesidades}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-orange-500" />
              Consumo {formatMoney(consumo)} · {pctConsumo}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-violet-500" />
              Ahorro {formatMoney(ahorro)} · {pctAhorro}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              Disponible {formatMoney(delta)} · {pctDelta}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
