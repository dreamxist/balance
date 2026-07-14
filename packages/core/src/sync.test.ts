import { describe, expect, it, vi } from 'vitest'
import { triggerGmailSync } from './sync'

describe('triggerGmailSync', () => {
  it('invokes the edge function without since by default', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { promoted: 3 }, error: null })
    const client = { functions: { invoke } } as never
    const result = await triggerGmailSync(client)
    expect(invoke).toHaveBeenCalledWith('gmail-sync', { body: {} })
    expect(result).toEqual({ promoted: 3 })
  })

  it('passes since in the body for backfill', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: {}, error: null })
    const client = { functions: { invoke } } as never
    await triggerGmailSync(client, { since: '2026-06-01' })
    expect(invoke).toHaveBeenCalledWith('gmail-sync', { body: { since: '2026-06-01' } })
  })

  it('throws the invocation error', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error('502') })
    const client = { functions: { invoke } } as never
    await expect(triggerGmailSync(client)).rejects.toThrow('502')
  })
})
