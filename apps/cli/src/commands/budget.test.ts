import { describe, expect, it } from 'vitest'
import { parseBudgetAmount, renderBucketBudgets } from './budget'

describe('parseBudgetAmount', () => {
  it('accepts zero and thousand separators', () => {
    expect(parseBudgetAmount('0')).toBe(0)
    expect(parseBudgetAmount('500.000')).toBe(500000)
    expect(parseBudgetAmount('180000')).toBe(180000)
  })

  it('rejects negatives and decimals', () => {
    expect(() => parseBudgetAmount('-1000')).toThrow()
    expect(() => parseBudgetAmount('10,5')).toThrow()
  })
})

describe('renderBucketBudgets', () => {
  it('shows budget, spent and remaining per bucket', () => {
    const out = renderBucketBudgets(
      {
        month: '2026-10',
        buckets: [
          { bucket: 'necesidades', budget: 500000, spent: 320000, remaining: 180000, daily: [] },
          { bucket: 'consumo', budget: null, spent: 40000, remaining: null, daily: [] },
          { bucket: 'ahorro', budget: 275000, spent: 300000, remaining: -25000, daily: [] },
        ],
      },
      'personal',
    )
    expect(out).toContain('Presupuesto 2026-10 (personal)')
    expect(out).toMatch(/Necesidades\s+\$500\.000\s+\$320\.000\s+\$180\.000/)
    expect(out).toMatch(/Consumo\s+—\s+\$40\.000\s+—/)
    expect(out).toMatch(/Ahorro.*\$-25\.000/)
    expect(out).toContain('bal budget set')
  })
})
