import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface RecommendationsProps {
  isOnboarded: boolean
  features?: { spa?: boolean; investments?: boolean }
  accountCount: number
  className?: string
}

interface Recommendation {
  id: string
  text: string
}

export function Recommendations({ isOnboarded, features, accountCount, className }: RecommendationsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const items = useMemo(() => {
    const recs: Recommendation[] = []

    if (isOnboarded && accountCount <= 1) {
      recs.push({ id: 'detail-accounts', text: 'Detalla tus cuentas para un balance mas preciso' })
    }

    if (features?.spa) {
      recs.push({ id: 'setup-spa', text: 'Configura tu empresa en el tab SpA' })
    }

    if (features?.investments) {
      recs.push({ id: 'add-investments', text: 'Agrega tus inversiones en Patrimonio' })
    }

    return recs.filter((r) => !dismissed.has(r.id)).slice(0, 3)
  }, [isOnboarded, features, accountCount, dismissed])

  if (items.length === 0) return null

  return (
    <div className={cn('col-span-1 lg:col-span-4', className)}>
      <div className="space-y-2">
        {items.map((rec) => (
          <div
            key={rec.id}
            className="flex items-center justify-between rounded-md border border-border bg-card px-5 py-3"
          >
            <span className="text-sm text-foreground">{rec.text}</span>
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(rec.id))}
              className="ml-4 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Descartar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
