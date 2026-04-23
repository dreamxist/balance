import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'

interface DeltaIndicatorProps {
  delta: number
  status: 'green' | 'amber' | 'red'
  className?: string
}

const statusConfig = {
  green: {
    dotClass: 'bg-[var(--color-balanced)]',
    textClass: 'text-[var(--color-balanced)]',
    label: 'Cuadrado',
  },
  amber: {
    dotClass: 'bg-[var(--color-warning)]',
    textClass: 'text-[var(--color-warning)]',
    label: 'Pendiente',
  },
  red: {
    dotClass: 'bg-[var(--color-unbalanced)]',
    textClass: 'text-[var(--color-unbalanced)]',
    label: 'Descuadrado',
  },
} as const

export function DeltaIndicator({ delta, status, className }: DeltaIndicatorProps) {
  const config = statusConfig[status]

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            config.dotClass,
            status === 'green' && delta === 0 && 'animate-pulse',
          )}
        />
        <span className={cn('font-mono text-2xl font-semibold tabular-nums', config.textClass)}>
          {formatMoney(delta)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  )
}
