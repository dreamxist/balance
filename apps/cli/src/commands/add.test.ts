import { describe, expect, it } from 'vitest'
import { parseAmount } from './add'

describe('parseAmount', () => {
  it('parses plain integers', () => {
    expect(parseAmount('8000')).toBe(8000)
  })

  it('strips dot thousands separators', () => {
    expect(parseAmount('8.000')).toBe(8000)
    expect(parseAmount('1.234.567')).toBe(1234567)
  })

  it('strips comma and space separators', () => {
    expect(parseAmount('8,000')).toBe(8000)
    expect(parseAmount('8 000')).toBe(8000)
    expect(parseAmount('8_000')).toBe(8000)
  })

  it('returns absolute value for negatives', () => {
    expect(parseAmount('-500')).toBe(500)
  })

  it('throws on zero', () => {
    expect(() => parseAmount('0')).toThrow(/invalid amount/)
  })

  it('throws on non-numeric input', () => {
    expect(() => parseAmount('abc')).toThrow(/invalid amount/)
    expect(() => parseAmount('')).toThrow(/invalid amount/)
    expect(() => parseAmount('1.5')).toThrow(/invalid amount/)
  })
})
