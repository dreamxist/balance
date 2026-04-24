import { describe, expect, it } from 'vitest'
import { extractFintualAccounts } from './fintual'

describe('extractFintualAccounts', () => {
  it('parses metadata objects', () => {
    const out = extractFintualAccounts([
      {
        id: 'a',
        name: 'Fund A',
        balance: 100,
        metadata: { fintual_asset_id: 1, shares: 10 },
      },
    ])
    expect(out).toEqual([
      { id: 'a', name: 'Fund A', assetId: 1, shares: 10, currentBalance: 100 },
    ])
  })

  it('parses metadata strings (JSONB sometimes comes back as string)', () => {
    const out = extractFintualAccounts([
      {
        id: 'b',
        name: 'Fund B',
        balance: 200,
        metadata: '{"fintual_asset_id": 2, "shares": 20}',
      },
    ])
    expect(out).toEqual([
      { id: 'b', name: 'Fund B', assetId: 2, shares: 20, currentBalance: 200 },
    ])
  })

  it('skips accounts without fintual metadata', () => {
    const out = extractFintualAccounts([
      { id: 'c', name: 'Cash', balance: 500, metadata: null },
      { id: 'd', name: 'Other', balance: 0, metadata: { foo: 'bar' } },
      { id: 'e', name: 'Partial', balance: 0, metadata: { fintual_asset_id: 5 } },
    ])
    expect(out).toEqual([])
  })

  it('handles malformed metadata strings without throwing', () => {
    const out = extractFintualAccounts([
      { id: 'f', name: 'Broken', balance: 0, metadata: '{not json' },
    ])
    expect(out).toEqual([])
  })

  it('treats null balance as zero', () => {
    const out = extractFintualAccounts([
      {
        id: 'g',
        name: 'Fund C',
        balance: null,
        metadata: { fintual_asset_id: 3, shares: 30 },
      },
    ])
    expect(out[0]?.currentBalance).toBe(0)
  })
})
