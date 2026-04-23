import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getClientIp,
  makeMemoryLimiter,
} from '../supabase/functions/_shared/rate-limit'

// ============================================================
// Rate limiter (auth-apikey GAP B)
// ============================================================

describe('rate limiter (memory backend)', () => {
  let limiter: ReturnType<typeof makeMemoryLimiter>

  beforeEach(() => {
    limiter = makeMemoryLimiter({ bucket: 'test', windowMs: 5 * 60 * 1000 })
  })

  it('starts at 0 attempts for an unseen IP', async () => {
    expect(await limiter.read('1.2.3.4')).toBe(0)
  })

  it('bump increments per IP independently', async () => {
    expect(await limiter.bump('a')).toBe(1)
    expect(await limiter.bump('a')).toBe(2)
    expect(await limiter.bump('b')).toBe(1)
    expect(await limiter.read('a')).toBe(2)
    expect(await limiter.read('b')).toBe(1)
  })

  it('reset clears the counter', async () => {
    await limiter.bump('x')
    await limiter.bump('x')
    expect(await limiter.read('x')).toBe(2)
    await limiter.reset('x')
    expect(await limiter.read('x')).toBe(0)
  })

  it('reaches the 5-attempt threshold after 5 failures', async () => {
    const ip = '9.9.9.9'
    for (let i = 0; i < 5; i++) await limiter.bump(ip)
    expect(await limiter.read(ip)).toBe(5)
    // The handler refuses when read >= 5; ensure threshold works.
    expect(await limiter.read(ip) >= 5).toBe(true)
  })

  it('expires after the configured window', async () => {
    const shortLimiter = makeMemoryLimiter({ bucket: 'short', windowMs: 1 })
    await shortLimiter.bump('ip')
    await new Promise((r) => setTimeout(r, 5))
    expect(await shortLimiter.read('ip')).toBe(0)
  })
})

describe('getClientIp', () => {
  it('prefers x-forwarded-for first hop', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
    })
    expect(getClientIp(req)).toBe('1.1.1.1')
  })
  it('falls back to x-real-ip', () => {
    const req = new Request('http://x', { headers: { 'x-real-ip': '3.3.3.3' } })
    expect(getClientIp(req)).toBe('3.3.3.3')
  })
  it('falls back to cf-connecting-ip', () => {
    const req = new Request('http://x', { headers: { 'cf-connecting-ip': '4.4.4.4' } })
    expect(getClientIp(req)).toBe('4.4.4.4')
  })
  it('returns unknown when nothing is present', () => {
    expect(getClientIp(new Request('http://x'))).toBe('unknown')
  })
})

// ============================================================
// daily-charges user scoping (GAP A)
// ============================================================
//
// We don't boot a Deno runtime here; instead we statically assert that the
// shipped index.ts contains the safety properties we care about. This guards
// against regressions where someone reintroduces the cross-user query.

describe('daily-charges source guards (GAP A)', () => {
  const source = readFileSync(
    resolve(__dirname, '../supabase/functions/daily-charges/index.ts'),
    'utf8',
  )

  it('cron path enumerates user_ids before processing charges', () => {
    expect(source).toMatch(/from\(['"]recurring_charges['"]\)[\s\S]*?\.select\(['"]user_id['"]\)/)
  })

  it('per-user charge query filters by user_id', () => {
    // The processChargesForUser function must filter recurring_charges by user_id
    expect(source).toMatch(/processChargesForUser[\s\S]{0,2000}\.eq\(['"]user_id['"], userId\)/)
  })

  it('per-user debt query filters by user_id', () => {
    expect(source).toMatch(/processDebtsForUser[\s\S]{0,2000}\.eq\(['"]user_id['"], userId\)/)
  })

  it('user JWT mode restricts to authenticatedUserId only', () => {
    expect(source).toMatch(/userIds = \[authenticatedUserId as string\]/)
  })

  it('cron mode requires explicit secret match (no permissive fallback)', () => {
    expect(source).toMatch(/isCronCall = !!\(cronSecret && bearerToken && bearerToken === cronSecret\)/)
  })

  it('defends in depth against mismatched user_id rows', () => {
    expect(source).toMatch(/charge\.user_id !== userId/)
    expect(source).toMatch(/debt\.user_id !== userId/)
  })

  it('does not log raw user_id values, uses opaque tag instead', () => {
    expect(source).toMatch(/shortUserTag/)
  })
})

describe('auth-apikey source guards (GAP B)', () => {
  const source = readFileSync(
    resolve(__dirname, '../supabase/functions/auth-apikey/index.ts'),
    'utf8',
  )

  it('imports the shared rate limiter', () => {
    expect(source).toMatch(/from ['"]\.\.\/_shared\/rate-limit\.ts['"]/)
  })

  it('checks limiter before processing the request', () => {
    expect(source).toMatch(/currentAttempts >= RATE_LIMIT_MAX_FAILED/)
  })

  it('returns 429 with Retry-After header when exceeded', () => {
    expect(source).toMatch(/status: 429/)
    expect(source).toMatch(/Retry-After/)
  })

  it('bumps on missing header and on invalid key', () => {
    // Missing header path
    expect(source).toMatch(/Missing x-api-key header[\s\S]{0,500}limiter\.bump/)
    // Invalid key path
    const bumpCount = (source.match(/limiter\.bump\(clientIp\)/g) ?? []).length
    expect(bumpCount).toBeGreaterThanOrEqual(2)
  })

  it('resets the counter on successful auth', () => {
    expect(source).toMatch(/limiter\.reset\(clientIp\)/)
  })

  it('uses the configured 5-attempt / 5-minute window', () => {
    expect(source).toMatch(/RATE_LIMIT_MAX_FAILED = 5/)
    expect(source).toMatch(/RATE_LIMIT_WINDOW_MS = 5 \* 60 \* 1000/)
  })
})

describe('daily-backup source guards', () => {
  const source = readFileSync(
    resolve(__dirname, '../supabase/functions/daily-backup/index.ts'),
    'utf8',
  )

  it('fails closed when CRON_SECRET is not configured', () => {
    expect(source).toMatch(/if \(!cronSecret\)/)
    expect(source).toMatch(/Server misconfigured/)
  })

  it('still requires Bearer match when secret is set', () => {
    expect(source).toMatch(/authHeader !== `Bearer \$\{cronSecret\}`/)
  })
})
