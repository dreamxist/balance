import { describe, expect, it } from 'vitest'
import { isIsoDate, isPeriod, periodRange } from './period'

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

  it('quarter yields from first day of current quarter', () => {
    expect(periodRange('quarter', new Date(2026, 0, 15))).toEqual({
      start: '2026-01-01',
      endExclusive: '2026-01-16',
    })
    expect(periodRange('quarter', new Date(2026, 3, 22))).toEqual({
      start: '2026-04-01',
      endExclusive: '2026-04-23',
    })
    expect(periodRange('quarter', new Date(2026, 7, 5))).toEqual({
      start: '2026-07-01',
      endExclusive: '2026-08-06',
    })
    expect(periodRange('quarter', new Date(2026, 10, 30))).toEqual({
      start: '2026-10-01',
      endExclusive: '2026-12-01',
    })
  })

  it('year yields from Jan 1 to tomorrow', () => {
    expect(periodRange('year', REF)).toEqual({
      start: '2026-01-01',
      endExclusive: '2026-04-23',
    })
  })

  it('all yields from epoch to tomorrow', () => {
    expect(periodRange('all', REF)).toEqual({
      start: '1970-01-01',
      endExclusive: '2026-04-23',
    })
  })
})

describe('isPeriod', () => {
  it('accepts valid periods', () => {
    expect(isPeriod('day')).toBe(true)
    expect(isPeriod('week')).toBe(true)
    expect(isPeriod('month')).toBe(true)
    expect(isPeriod('quarter')).toBe(true)
    expect(isPeriod('year')).toBe(true)
    expect(isPeriod('all')).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(isPeriod('decade')).toBe(false)
    expect(isPeriod('')).toBe(false)
    expect(isPeriod('WEEK')).toBe(false)
  })
})

describe('isIsoDate', () => {
  it('accepts YYYY-MM-DD format', () => {
    expect(isIsoDate('2026-04-22')).toBe(true)
    expect(isIsoDate('1970-01-01')).toBe(true)
  })

  it('rejects other formats', () => {
    expect(isIsoDate('2026-4-22')).toBe(false)
    expect(isIsoDate('22-04-2026')).toBe(false)
    expect(isIsoDate('2026-04-22T00:00:00Z')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})
