import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getClientIp, getLimiter } from '../_shared/rate-limit.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// New secret key for Auth Admin API (ECC-compatible)
// Set via: supabase secrets set AUTH_SECRET_KEY=sb_secret_xxx
const authSecretKey = Deno.env.get('AUTH_SECRET_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-api-key, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Rate limit (GAP B): 5 failed attempts per IP per 5 minute window. Successful
// auth resets. Implemented in _shared/rate-limit.ts so it's testable.
const RATE_LIMIT_MAX_FAILED = 5
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_RETRY_AFTER_S = 300
const RATE_LIMIT_BUCKET = 'auth_apikey'

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Call GoTrue Admin API directly with the new secret key
async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const key = authSecretKey ?? supabaseServiceKey
  return fetch(`${supabaseUrl}/auth/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      ...options.headers,
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const clientIp = getClientIp(req)
  const limiter = await getLimiter({
    bucket: RATE_LIMIT_BUCKET,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })

  const currentAttempts = await limiter.read(clientIp)
  if (currentAttempts >= RATE_LIMIT_MAX_FAILED) {
    return Response.json(
      { error: 'Too many failed attempts. Try again later.' },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(RATE_LIMIT_RETRY_AFTER_S),
        },
      },
    )
  }

  try {
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      await limiter.bump(clientIp)
      return Response.json({ error: 'Missing x-api-key header' }, { status: 401, headers: corsHeaders })
    }

    const keyHash = await sha256(apiKey)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: keyRecord, error } = await supabase
      .from('api_keys')
      .select('id, user_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single()

    if (error || !keyRecord) {
      await limiter.bump(clientIp)
      return Response.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders })
    }

    // Fire and forget: update last_used_at
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRecord.id).then()

    // Get user email via Admin API
    const userRes = await adminFetch(`/admin/users/${keyRecord.user_id}`)
    if (!userRes.ok) {
      const err = await userRes.text()
      console.error('getUserById failed:', err)
      // Internal failure: don't bump (the key itself was valid).
      return Response.json({ error: 'User not found' }, { status: 500, headers: corsHeaders })
    }
    const userData = await userRes.json()
    const email = userData.email as string
    if (!email) {
      return Response.json({ error: 'User has no email' }, { status: 500, headers: corsHeaders })
    }

    // Generate magic link (server-side, no email sent)
    const linkRes = await adminFetch('/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'magiclink', email }),
    })
    if (!linkRes.ok) {
      const err = await linkRes.text()
      console.error('generateLink failed:', err)
      return Response.json({ error: 'Token generation failed' }, { status: 500, headers: corsHeaders })
    }
    const linkData = await linkRes.json()
    const hashedToken = linkData.hashed_token as string
    if (!hashedToken) {
      return Response.json({ error: 'No hashed token in response' }, { status: 500, headers: corsHeaders })
    }

    // Exchange OTP for session
    const verifyRes = await adminFetch('/verify', {
      method: 'POST',
      body: JSON.stringify({ token_hash: hashedToken, type: 'magiclink' }),
    })
    if (!verifyRes.ok) {
      const err = await verifyRes.text()
      console.error('verifyOtp failed:', err)
      return Response.json({ error: 'Session creation failed' }, { status: 500, headers: corsHeaders })
    }
    const session = await verifyRes.json()

    if (!session.access_token) {
      return Response.json({ error: 'No access token in session' }, { status: 500, headers: corsHeaders })
    }

    // Reset on successful auth so legitimate users aren't penalised by sporadic
    // earlier failures.
    await limiter.reset(clientIp)

    return Response.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at * 1000,
    }, { headers: corsHeaders })
  } catch (err) {
    console.error('auth-apikey error:', err)
    return Response.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders })
  }
})
