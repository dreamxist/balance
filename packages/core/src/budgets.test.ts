import { describe, expect, it, vi } from 'vitest'
import { getBucketBudgets, setBucketBudget } from './budgets'

describe('getBucketBudgets', () => {
  it('normalizes the month and passes the entity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { month: '2026-10', buckets: [] }, error: null })
    const result = await getBucketBudgets({ rpc } as never, { month: '2026-10', entity: 'spa' })
    expect(rpc).toHaveBeenCalledWith('get_bucket_budgets', { p_month: '2026-10-01', p_entity: 'spa' })
    expect(result).toEqual({ month: '2026-10', buckets: [] })
  })
})

describe('setBucketBudget', () => {
  function client() {
    const single = vi.fn().mockResolvedValue({ data: { id: 'b1' }, error: null })
    const upsert = vi.fn(() => ({ select: () => ({ single }) }))
    return { upsert, client: { from: vi.fn(() => ({ upsert })) } as never }
  }

  it('upserts on (user_id, entity, bucket, month) with the first of the month', async () => {
    const { upsert, client: c } = client()
    await setBucketBudget(c, { bucket: 'consumo', amount: 150000, month: '2026-10' })
    expect(upsert).toHaveBeenCalledWith(
      { entity: 'personal', bucket: 'consumo', month: '2026-10-01', amount: 150000 },
      { onConflict: 'user_id,entity,bucket,month' },
    )
  })

  it('rejects decimals, negatives and a mid-month date', async () => {
    const { client: c } = client()
    await expect(setBucketBudget(c, { bucket: 'ahorro', amount: 1.5, month: '2026-10' })).rejects.toThrow()
    await expect(setBucketBudget(c, { bucket: 'ahorro', amount: -1, month: '2026-10' })).rejects.toThrow()
    await expect(setBucketBudget(c, { bucket: 'ahorro', amount: 1, month: '2026-10-15' })).rejects.toThrow()
  })
})
