import { describe, expect, it } from 'vitest'
import { usdToClp, parseUsdAmount } from './money'

describe('usdToClp', () => {
  it('converts USD to integer CLP at the given rate', () => {
    expect(usdToClp(245, 916)).toBe(224420) // validated against real SpA reembolso
    expect(usdToClp(6444, 916)).toBe(5902704)
  })

  it('rounds to the nearest peso', () => {
    expect(usdToClp(8.49, 916)).toBe(7777)
    expect(usdToClp(10, 916)).toBe(9160)
  })

  it('rejects invalid inputs', () => {
    expect(() => usdToClp(10, 0)).toThrow()
    expect(() => usdToClp(10, -5)).toThrow()
    expect(() => usdToClp(Number.NaN, 916)).toThrow()
  })
})

describe('parseUsdAmount', () => {
  it('accepts cents with dot or comma', () => {
    expect(parseUsdAmount('8.49')).toBe(8.49)
    expect(parseUsdAmount('8,49')).toBe(8.49)
    expect(parseUsdAmount('10')).toBe(10)
  })

  it('feeds usdToClp correctly (no thousand-separator trap)', () => {
    // regression: "8.49" must NOT be read as 849/8490
    expect(usdToClp(parseUsdAmount('8.49'), 916)).toBe(7777)
  })

  it('rejects non-positive / invalid', () => {
    expect(() => parseUsdAmount('0')).toThrow()
    expect(() => parseUsdAmount('-5')).toThrow()
    expect(() => parseUsdAmount('abc')).toThrow()
  })
})
