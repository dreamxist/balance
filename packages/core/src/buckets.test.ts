import { describe, expect, it, vi } from 'vitest'
import { getMonthlyBuckets } from './buckets'
import type { MonthlyBuckets } from './buckets'

const SAMPLE: MonthlyBuckets = {
  income: 1200000,
  necesidades: 500000,
  consumo: 50000,
  ahorro: 480000,
  por_categorizar: 50000,
  disponible: 50000,
  month: '2026-03',
}

function mockClient(data: unknown = SAMPLE, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  return { client: { rpc } as never, rpc }
}

describe('getMonthlyBuckets', () => {
  it('calls the RPC without args by default (current month, personal)', async () => {
    const { client, rpc } = mockClient()
    const result = await getMonthlyBuckets(client)
    expect(rpc).toHaveBeenCalledWith('get_monthly_buckets', {})
    expect(result).toEqual(SAMPLE)
  })

  it('normalizes YYYY-MM to first day of month', async () => {
    const { client, rpc } = mockClient()
    await getMonthlyBuckets(client, { month: '2026-03' })
    expect(rpc).toHaveBeenCalledWith('get_monthly_buckets', { p_month: '2026-03-01' })
  })

  it('passes full dates through unchanged', async () => {
    const { client, rpc } = mockClient()
    await getMonthlyBuckets(client, { month: '2026-03-15' })
    expect(rpc).toHaveBeenCalledWith('get_monthly_buckets', { p_month: '2026-03-15' })
  })

  it('passes entity when provided', async () => {
    const { client, rpc } = mockClient()
    await getMonthlyBuckets(client, { month: '2026-03', entity: 'spa' })
    expect(rpc).toHaveBeenCalledWith('get_monthly_buckets', {
      p_month: '2026-03-01',
      p_entity: 'spa',
    })
  })

  it('rejects malformed months without calling the RPC', async () => {
    const { client, rpc } = mockClient()
    await expect(getMonthlyBuckets(client, { month: '03-2026' })).rejects.toThrow(/Invalid month/)
    await expect(getMonthlyBuckets(client, { month: 'marzo' })).rejects.toThrow(/Invalid month/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws the RPC error', async () => {
    const { client } = mockClient(null, new Error('rpc failed'))
    await expect(getMonthlyBuckets(client)).rejects.toThrow('rpc failed')
  })
})
