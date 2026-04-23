import { describe, expect, it } from 'vitest'
import { extractKeyPrefix } from './key'

describe('extractKeyPrefix', () => {
  it('takes the first 12 characters to keep bal_ + 8 hex', () => {
    expect(extractKeyPrefix('bal_abcdef0123456789')).toBe('bal_abcdef01')
  })

  it('returns the whole string if shorter than 12', () => {
    expect(extractKeyPrefix('bal_abc')).toBe('bal_abc')
  })

  it('is deterministic', () => {
    const key = 'bal_1234567890abcdef1234567890abcdef1234567890abcdef'
    expect(extractKeyPrefix(key)).toBe(extractKeyPrefix(key))
    expect(extractKeyPrefix(key)).toHaveLength(12)
  })
})
