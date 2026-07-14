import { describe, expect, it } from 'vitest'
import { computeDistribution } from './distribution'
import type { MonthlyBuckets } from '@balance/core'

function buckets(partial: Partial<MonthlyBuckets>): MonthlyBuckets {
  return {
    income: 0,
    necesidades: 0,
    consumo: 0,
    ahorro: 0,
    por_categorizar: 0,
    disponible: 0,
    month: '2026-03',
    ...partial,
  }
}

describe('computeDistribution', () => {
  it('splits percentages over gastado + disponible', () => {
    const segments = computeDistribution(
      buckets({ necesidades: 500, consumo: 250, ahorro: 150, disponible: 100 }),
    )
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.pct]))
    expect(byKey).toEqual({
      necesidades: 50,
      consumo: 25,
      ahorro: 15,
      por_categorizar: 0,
      disponible: 10,
    })
  })

  it('includes por_categorizar as its own segment, never inside consumo', () => {
    const segments = computeDistribution(
      buckets({ consumo: 300, por_categorizar: 700 }),
    )
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.pct]))
    expect(byKey.consumo).toBe(30)
    expect(byKey.por_categorizar).toBe(70)
  })

  it('negative disponible gets pct 0 without shrinking spent segments', () => {
    const segments = computeDistribution(
      buckets({ necesidades: 600, consumo: 400, disponible: -123456 }),
    )
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s]))
    expect(byKey.necesidades!.pct).toBe(60)
    expect(byKey.consumo!.pct).toBe(40)
    expect(byKey.disponible!.pct).toBe(0)
    expect(byKey.disponible!.amount).toBe(-123456)
  })

  it('empty month yields all-zero percentages', () => {
    for (const s of computeDistribution(buckets({}))) {
      expect(s.pct).toBe(0)
    }
  })
})
