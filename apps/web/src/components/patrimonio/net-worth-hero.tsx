import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney } from '@/lib/format'
import { AnimatedNumber } from '@/components/ui/animated-number'

interface NetWorthHeroProps {
  netWorth: number
  previousNetWorth?: number
  isLoading: boolean
}

export function NetWorthHero({ netWorth, previousNetWorth, isLoading }: NetWorthHeroProps) {
  const change = previousNetWorth != null ? netWorth - previousNetWorth : null
  const changePercent = previousNetWorth != null && previousNetWorth !== 0
    ? ((netWorth - previousNetWorth) / Math.abs(previousNetWorth)) * 100
    : null

  return (
    <div className="col-span-full rounded-md border border-border bg-card p-4 md:p-5">
      <p className="text-sm text-muted-foreground">Patrimonio total</p>

      {isLoading ? (
        <Skeleton className="mt-2 h-10 w-56" />
      ) : (
        <p className="mt-1 text-3xl font-bold md:text-4xl">
          <AnimatedNumber value={netWorth} className="text-3xl font-bold md:text-4xl" />
        </p>
      )}

      {!isLoading && change != null && changePercent != null && (
        <p className={`mt-1 text-sm ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {change >= 0 ? '+' : ''}{formatMoney(change)} ({change >= 0 ? '\u2191' : '\u2193'}{Math.abs(changePercent).toFixed(1)}%)
        </p>
      )}
    </div>
  )
}
