import { transactionSource, type TransactionSource } from '@balance/core'
import { cn } from '@/lib/utils'

const LABELS: Record<Exclude<TransactionSource, 'manual'>, string> = {
  fintoc: 'Fintoc',
  gmail: 'Gmail',
  apple_pay: 'Apple Pay',
  recurring: 'Recurrente',
}

export function SourceBadge({ metadata, className }: { metadata: unknown; className?: string }) {
  const source = transactionSource(metadata)
  if (source === 'manual') return null
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm border border-border px-1 py-px text-[10px] leading-none text-muted-foreground',
        className,
      )}
    >
      {LABELS[source]}
    </span>
  )
}
