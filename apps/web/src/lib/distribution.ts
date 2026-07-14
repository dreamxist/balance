import type { MonthlyBuckets } from '@balance/core'

export type DistributionKey =
  | 'necesidades'
  | 'consumo'
  | 'ahorro'
  | 'por_categorizar'
  | 'disponible'

export interface DistributionSegment {
  key: DistributionKey
  amount: number
  pct: number
}

/**
 * Bar segments for the monthly distribution. Percentages are over
 * gastado + disponible (when positive); a negative disponible renders
 * as amount-only (pct 0) and does not shrink the other segments.
 */
export function computeDistribution(buckets: MonthlyBuckets): DistributionSegment[] {
  const gastado =
    buckets.necesidades + buckets.consumo + buckets.ahorro + buckets.por_categorizar
  const total = gastado + Math.max(buckets.disponible, 0)

  function pct(amount: number): number {
    return total > 0 ? Math.round((amount / total) * 100) : 0
  }

  return [
    { key: 'necesidades', amount: buckets.necesidades, pct: pct(buckets.necesidades) },
    { key: 'consumo', amount: buckets.consumo, pct: pct(buckets.consumo) },
    { key: 'ahorro', amount: buckets.ahorro, pct: pct(buckets.ahorro) },
    { key: 'por_categorizar', amount: buckets.por_categorizar, pct: pct(buckets.por_categorizar) },
    { key: 'disponible', amount: buckets.disponible, pct: pct(Math.max(buckets.disponible, 0)) },
  ]
}
