// Shared rate-limit primitives for Edge Functions.
//
// Default storage is Deno KV (persistent across isolates within a Supabase
// project) with an in-memory fallback for environments where Deno.openKv is
// unavailable (older runtimes, some local setups, vitest).

export interface RateLimiter {
  read(ip: string): Promise<number>
  bump(ip: string): Promise<number>
  reset(ip: string): Promise<void>
}

export interface RateLimitConfig {
  /** Logical bucket name; allows separate counters for different endpoints. */
  bucket: string
  /** Window in milliseconds before counter expires. */
  windowMs: number
}

export function makeMemoryLimiter(config: RateLimitConfig): RateLimiter {
  const map = new Map<string, { count: number; expiresAt: number }>()
  function getEntry(ip: string): { count: number; expiresAt: number } | null {
    const e = map.get(ip)
    if (!e) return null
    if (Date.now() > e.expiresAt) {
      map.delete(ip)
      return null
    }
    return e
  }
  return {
    async read(ip) {
      return getEntry(ip)?.count ?? 0
    },
    async bump(ip) {
      const existing = getEntry(ip)
      const next = (existing?.count ?? 0) + 1
      map.set(ip, { count: next, expiresAt: Date.now() + config.windowMs })
      return next
    },
    async reset(ip) {
      map.delete(ip)
    },
  }
}

export async function makeKvLimiter(
  config: RateLimitConfig,
): Promise<RateLimiter | null> {
  try {
    // deno-lint-ignore no-explicit-any
    const openKv = (globalThis as any).Deno?.openKv
    if (typeof openKv !== 'function') return null
    // deno-lint-ignore no-explicit-any
    const kv = await openKv.call((globalThis as any).Deno)
    return {
      async read(ip) {
        const res = await kv.get<number>(['rate_limit', config.bucket, ip])
        return typeof res.value === 'number' ? res.value : 0
      },
      async bump(ip) {
        const key = ['rate_limit', config.bucket, ip]
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = await kv.get<number>(key)
          const next = (current.value ?? 0) + 1
          const result = await kv.atomic()
            .check(current)
            .set(key, next, { expireIn: config.windowMs })
            .commit()
          if (result.ok) return next
        }
        // Last-resort non-atomic write.
        await kv.set(key, 1, { expireIn: config.windowMs })
        return 1
      },
      async reset(ip) {
        await kv.delete(['rate_limit', config.bucket, ip])
      },
    }
  } catch (err) {
    console.warn(
      `Deno.openKv unavailable for bucket=${config.bucket}, falling back to memory:`,
      err,
    )
    return null
  }
}

/**
 * Lazily build a RateLimiter, preferring Deno KV and falling back to in-memory.
 * The result is cached per (bucket, windowMs) tuple so callers don't need to
 * memoize themselves.
 */
const limiterCache = new Map<string, Promise<RateLimiter>>()
export function getLimiter(config: RateLimitConfig): Promise<RateLimiter> {
  const cacheKey = `${config.bucket}:${config.windowMs}`
  let p = limiterCache.get(cacheKey)
  if (!p) {
    p = (async () => (await makeKvLimiter(config)) ?? makeMemoryLimiter(config))()
    limiterCache.set(cacheKey, p)
  }
  return p
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  return 'unknown'
}
