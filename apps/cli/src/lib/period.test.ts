import { describe, expect, it } from 'vitest'
import { isPeriod, periodRange } from './period'

const REF = new Date(2026, 3, 22) // 2026-04-22 local time

describe('periodRange', () => {
  it('day yields a single-day range', () => {
    const r = periodRange('day', REF)
    expect(r).toEqual({ start: '2026-04-22', endExclusive: '2026-04-23' })
  })

  it('week yields the last 7 days including today', () => {
    const r = periodRange('week', REF)
    expect(r).toEqual({ start: '2026-04-16', endExclusive: '2026-04-23' })
  })

  it('month yields from day 1 to tomorrow exclusive', () => {
    const r = periodRange('month', REF)
    expect(r).toEqual({ start: '2026-04-01', endExclusive: '2026-04-23' })
  })

  it('month crosses year boundary correctly', () => {
    const r = periodRange('month', new Date(2026, 0, 3))
    expect(r).toEqual({ start: '2026-01-01', endExclusive: '2026-01-04' })
  })
})

describe('isPeriod', () => {
  it('accepts valid periods', () => {
    expect(isPeriod('day')).toBe(true)
    expect(isPeriod('week')).toBe(true)
    expect(isPeriod('month')).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(isPeriod('year')).toBe(false)
    expect(isPeriod('')).toBe(false)
    expect(isPeriod('WEEK')).toBe(false)
  })
})
