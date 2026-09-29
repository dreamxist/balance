import { describe, expect, it, vi } from 'vitest'
import { triggerFintocSync, triggerGmailSync } from './sync'

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

describe('triggerFintocSync', () => {
  it('invokes fintoc-sync and returns its summary', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { configured: true, promoted: 2 }, error: null })
    const client = { functions: { invoke } } as never
    const result = await triggerFintocSync(client)
    expect(invoke).toHaveBeenCalledWith('fintoc-sync', { body: {} })
    expect(result).toEqual({ configured: true, promoted: 2 })
  })

  it('surfaces the JSON error body of a failed call', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'Fintoc link status is login_required' }), { status: 409 }),
    })
    const invoke = vi.fn().mockResolvedValue({ data: null, error })
    const client = { functions: { invoke } } as never
    await expect(triggerFintocSync(client)).rejects.toThrow('login_required')
  })

  it('falls back to the plain-text body', async () => {
    const error = Object.assign(new Error('non-2xx'), {
      context: new Response('Forbidden: not the Fintoc link owner', { status: 403 }),
    })
    const invoke = vi.fn().mockResolvedValue({ data: null, error })
    const client = { functions: { invoke } } as never
    await expect(triggerFintocSync(client)).rejects.toThrow('not the Fintoc link owner')
  })
})
