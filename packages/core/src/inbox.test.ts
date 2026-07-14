import { describe, expect, it, vi } from 'vitest'
import {
  createCategorizationRule,
  getSyncState,
  promoteEmailMovements,
  setTransactionCategory,
} from './inbox'

describe('setTransactionCategory', () => {
  it('calls the RPC with transaction id and category', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { category: 'consumo.comida' }, error: null })
    const client = { rpc } as never
    const result = await setTransactionCategory(client, 'tx-1', 'consumo.comida')
    expect(rpc).toHaveBeenCalledWith('set_transaction_category', {
      p_transaction_id: 'tx-1',
      p_category: 'consumo.comida',
    })
    expect(result).toEqual({ category: 'consumo.comida' })
  })

  it('throws the RPC error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('42501') })
    const client = { rpc } as never
    await expect(setTransactionCategory(client, 'tx-1', 'x')).rejects.toThrow('42501')
  })
})

describe('promoteEmailMovements', () => {
  it('passes the usd rate to the RPC', async () => {
    const summary = { promoted: 1, skipped_existing: 0, pending: 0, errors: 0 }
    const rpc = vi.fn().mockResolvedValue({ data: summary, error: null })
    const client = { rpc } as never
    const result = await promoteEmailMovements(client, { usdRate: 912.5 })
    expect(rpc).toHaveBeenCalledWith('promote_email_movements', { p_usd_rate: 912.5 })
    expect(result).toEqual(summary)
  })
})

describe('getSyncState', () => {
  it('returns null when the user never synced', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const select = vi.fn().mockReturnValue({ maybeSingle })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as never
    expect(await getSyncState(client)).toBe(null)
    expect(from).toHaveBeenCalledWith('sync_state')
  })
})

describe('createCategorizationRule', () => {
  function mockClient(userId: string | null) {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'rule-1', pattern: 'CRUNCHYROLL' },
      error: null,
    })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    const getUser = vi.fn().mockResolvedValue({
      data: { user: userId ? { id: userId } : null },
      error: userId ? null : new Error('no session'),
    })
    return { client: { from, auth: { getUser } } as never, insert }
  }

  it('inserts with the authenticated user id and default priority', async () => {
    const { client, insert } = mockClient('user-9')
    await createCategorizationRule(client, {
      pattern: 'CRUNCHYROLL',
      category: 'consumo.entretencion',
    })
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-9',
      pattern: 'CRUNCHYROLL',
      category: 'consumo.entretencion',
      priority: 0,
    })
  })

  it('fails without a session', async () => {
    const { client } = mockClient(null)
    await expect(
      createCategorizationRule(client, { pattern: 'X', category: 'consumo.tech' }),
    ).rejects.toThrow()
  })
})
