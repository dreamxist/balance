import { describe, expect, it, vi } from 'vitest'
import { evaluateSyncHealth, triggerFintocSync, triggerGmailSync, type SyncHealthInput } from './sync'

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

describe('triggerGmailSync errors', () => {
  it('surfaces the JSON error body of a failed call', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'Gmail token refresh failed: 401' }), { status: 502 }),
    })
    const invoke = vi.fn().mockResolvedValue({ data: null, error })
    const client = { functions: { invoke } } as never
    await expect(triggerGmailSync(client)).rejects.toThrow('Gmail token refresh failed')
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

describe('evaluateSyncHealth', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const empty: SyncHealthInput = {
    gmail_last_success_at: null, gmail_last_error: null, gmail_last_error_at: null,
    fintoc_last_success_at: null, fintoc_last_error: null, fintoc_last_error_at: null,
  }

  it('reports nothing without state or for sources that never ran', () => {
    expect(evaluateSyncHealth(null, now)).toEqual([])
    expect(evaluateSyncHealth(empty, now)).toEqual([])
  })

  it('reports nothing for a recent success', () => {
    const state = { ...empty, gmail_last_success_at: '2026-10-10T11:00:00Z' }
    expect(evaluateSyncHealth(state, now)).toEqual([])
  })

  it('reports a failure newer than the last success, with its error', () => {
    const state = {
      ...empty,
      gmail_last_success_at: '2026-10-10T00:00:00Z',
      gmail_last_error: 'Gmail token refresh failed: 401 deleted_client',
      gmail_last_error_at: '2026-10-10T11:00:00Z',
    }
    expect(evaluateSyncHealth(state, now)).toEqual([{
      source: 'gmail',
      lastSuccessAt: '2026-10-10T00:00:00Z',
      error: 'Gmail token refresh failed: 401 deleted_client',
      hoursSinceSuccess: 12,
    }])
  })

  it('ignores an old error once a later run succeeded', () => {
    const state = {
      ...empty,
      fintoc_last_success_at: '2026-10-10T11:00:00Z',
      fintoc_last_error: 'login_required',
      fintoc_last_error_at: '2026-10-09T23:00:00Z',
    }
    expect(evaluateSyncHealth(state, now)).toEqual([])
  })

  it('reports a stale source even without a recorded error', () => {
    const state = { ...empty, fintoc_last_success_at: '2026-10-08T11:00:00Z' }
    const [issue] = evaluateSyncHealth(state, now)
    expect(issue).toMatchObject({ source: 'fintoc', error: null, hoursSinceSuccess: 49 })
  })

  it('reports a source that failed and never succeeded', () => {
    const state = { ...empty, fintoc_last_error: 'boom', fintoc_last_error_at: '2026-10-10T11:00:00Z' }
    expect(evaluateSyncHealth(state, now)).toEqual([
      { source: 'fintoc', lastSuccessAt: null, error: 'boom', hoursSinceSuccess: null },
    ])
  })
})
