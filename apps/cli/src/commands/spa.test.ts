import { describe, expect, it } from 'vitest'
import { parseYearMonth } from './spa'

describe('parseYearMonth', () => {
  it('parses YYYY-MM with two-digit month', () => {
    expect(parseYearMonth('2026-04')).toEqual({ year: 2026, month: 4 })
    expect(parseYearMonth('2026-12')).toEqual({ year: 2026, month: 12 })
  })

  it('parses single-digit month', () => {
    expect(parseYearMonth('2026-1')).toEqual({ year: 2026, month: 1 })
  })

  it('rejects invalid format', () => {
    expect(() => parseYearMonth('2026')).toThrow(/invalid month/)
    expect(() => parseYearMonth('26-04')).toThrow(/invalid month/)
    expect(() => parseYearMonth('2026/04')).toThrow(/invalid month/)
    expect(() => parseYearMonth('')).toThrow(/invalid month/)
  })

  it('rejects out-of-range month', () => {
    expect(() => parseYearMonth('2026-00')).toThrow(/Month must be 1-12/)
    expect(() => parseYearMonth('2026-13')).toThrow(/Month must be 1-12/)
  })
})
