// Apple Pay ingestion: an iOS Shortcut ("Transaction" automation in Wallet)
// posts { card, merchant, amount } with the user's bal API key. The purchase
// is booked by ingest_wallet_payment, which maps the card to an account and
// deduplicates against the same purchase notified by the bank.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getClientIp, getLimiter } from '../_shared/rate-limit.ts'
import { parsePayload } from './parse.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const RATE_LIMIT_MAX_FAILED = 5
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const clientIp = getClientIp(req)
  const limiter = await getLimiter({ bucket: 'wallet_ingest', windowMs: RATE_LIMIT_WINDOW_MS })
  if (await limiter.read(clientIp) >= RATE_LIMIT_MAX_FAILED) {
    return Response.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 })
  }

  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) {
    await limiter.bump(clientIp)
    return Response.json({ error: 'Missing x-api-key header' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: key } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', await sha256(apiKey))
    .eq('is_active', true)
    .maybeSingle()
  if (!key) {
    await limiter.bump(clientIp)
    return Response.json({ error: 'Invalid API key' }, { status: 401 })
  }
  await limiter.reset(clientIp)
  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 })
  }
  const parsed = parsePayload(body, new Date())
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 422 })
  }

  const { card, merchant, amount, occurredAt } = parsed.payment
  const { data, error } = await supabase.rpc('ingest_wallet_payment', {
    p_user_id: key.user_id,
    p_card: card,
    p_merchant: merchant,
    p_amount: amount,
    p_occurred_at: occurredAt,
  })
  if (error) {
    console.error(`wallet-ingest: ${error.message}`)
    return Response.json({ error: error.message }, { status: 500 })
  }
  console.log(`wallet-ingest: ${JSON.stringify(data)}`)
  return Response.json(data)
})
