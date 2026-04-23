import { describe, expect, it } from 'vitest'
import { isUuid } from './resolve'

describe('isUuid', () => {
  it('accepts canonical v4 uuids', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isUuid('ABCDEF01-2345-6789-ABCD-EF0123456789')).toBe(true)
  })

  it('rejects account names and malformed strings', () => {
    expect(isUuid('cuenta vista')).toBe(false)
    expect(isUuid('550e8400-e29b-41d4-a716')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid('550e8400-e29b-41d4-a716-44665544000Z')).toBe(false)
  })
})
