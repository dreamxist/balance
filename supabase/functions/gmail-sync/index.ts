// gmail-sync: fetches bank notification emails from the user's Gmail, stages
// them in email_movements and promotes them into transactions.
//
// Auth follows daily-charges: CRON_SECRET (fail-closed — unset secret never
// makes a caller cron) or a user JWT for manual `bal sync`. Cron mode resolves
// the target user from GMAIL_USER_ID (single-user v1); JWT mode uses the
// token subject. Gmail OAuth uses a refresh token minted once by
// scripts/gmail-auth.ts (scope gmail.readonly).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseEmail, sourceForEmail, type ParsedMovement, type RawEmail } from './parsers.ts'
import { buildGmailQuery, extractBody, headerValue, type GmailPayload } from './gmail.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

async function refreshAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID')
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN secrets')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json() as { access_token?: string }
  if (!json.access_token) throw new Error('Gmail token refresh returned no access_token')
  return json.access_token
}

async function listMessageIds(accessToken: string, query: string): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${GMAIL_API}/messages`)
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`)
    const json = await res.json() as {
      messages?: Array<{ id: string }>
      nextPageToken?: string
    }
    for (const m of json.messages ?? []) ids.push(m.id)
    pageToken = json.nextPageToken
  } while (pageToken)
  return ids
}

async function fetchEmail(accessToken: string, id: string): Promise<RawEmail> {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail get ${id} failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { payload?: GmailPayload; internalDate?: string }
  const payload = json.payload ?? {}
  return {
    id,
    from: headerValue(payload, 'From'),
    subject: headerValue(payload, 'Subject'),
    date: json.internalDate
      ? new Date(Number.parseInt(json.internalDate, 10)).toISOString()
      : new Date().toISOString(),
    body: extractBody(payload),
  }
}

/** CLP per USD from mindicador.cl; null on any failure (USD rows stay pending). */
async function fetchUsdRate(): Promise<number | null> {
  try {
    const res = await fetch('https://mindicador.cl/api/dolar')
    if (!res.ok) return null
    const json = await res.json() as { serie?: Array<{ valor?: number }> }
    const valor = json.serie?.[0]?.valor
    return typeof valor === 'number' && valor > 0 ? valor : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  const bearerToken = authHeader?.replace(/^Bearer\s+/, '')

  const isCronCall = !!(cronSecret && bearerToken && bearerToken === cronSecret)
  let authenticatedUserId: string | null = null

  if (!isCronCall && bearerToken) {
    const authClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error } = await authClient.auth.getUser(bearerToken)
    if (user && !error) authenticatedUserId = user.id
  }

  if (!isCronCall && !authenticatedUserId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // There is exactly one mailbox (one GMAIL_REFRESH_TOKEN). Only its owner may
  // sync it: any other authenticated user would otherwise import the owner's
  // bank movements into their own ledger. Fail closed when the owner is unset.
  const gmailOwner = Deno.env.get('GMAIL_USER_ID') ?? null
  if (!isCronCall && authenticatedUserId !== gmailOwner) {
    console.error(`gmail-sync: JWT user ${authenticatedUserId} is not the mailbox owner`)
    return new Response('Forbidden: not the mailbox owner', { status: 403 })
  }

  const userId = isCronCall ? gmailOwner : authenticatedUserId
  if (!userId) {
    return Response.json(
      { error: 'GMAIL_USER_ID secret is required for cron calls' },
      { status: 400 },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Watermark: explicit since (query param or JSON body, for backfill)
  // > sync_state > 7 days back
  let bodySince: string | null = null
  try {
    const body = await req.json() as { since?: unknown }
    if (typeof body.since === 'string') bodySince = body.since
  } catch {
    // no JSON body (e.g. cron GET) — fall through
  }
  const sinceParam = new URL(req.url).searchParams.get('since') ?? bodySince
  let since: Date
  if (sinceParam) {
    since = new Date(sinceParam)
    if (Number.isNaN(since.getTime())) {
      return Response.json({ error: `invalid since: ${sinceParam}` }, { status: 400 })
    }
  } else {
    const { data: state } = await supabase
      .from('sync_state')
      .select('gmail_watermark')
      .eq('user_id', userId)
      .maybeSingle()
    since = state?.gmail_watermark
      ? new Date(state.gmail_watermark)
      : new Date(Date.now() - DEFAULT_LOOKBACK_MS)
  }
  const runStartedAt = new Date()

  let accessToken: string
  try {
    accessToken = await refreshAccessToken()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`gmail-sync: token refresh failed: ${message}`)
    return Response.json({ error: message }, { status: 502 })
  }

  const query = buildGmailQuery(since.getTime() / 1000)
  let messageIds: string[]
  try {
    messageIds = await listMessageIds(accessToken, query)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`gmail-sync: message list failed: ${message}`)
    return Response.json({ error: message }, { status: 502 })
  }

  // Skip messages already staged (any status) — cheap dedup before fetching
  const seen = new Set<string>()
  if (messageIds.length > 0) {
    const { data: existing } = await supabase
      .from('email_movements')
      .select('gmail_message_id')
      .eq('user_id', userId)
      .in('gmail_message_id', messageIds)
    for (const row of existing ?? []) seen.add(row.gmail_message_id as string)
  }

  let fetched = 0
  let parsed = 0
  let ignored = 0
  let stagedErrors = 0
  const failures: string[] = []

  for (const id of messageIds) {
    if (seen.has(id)) continue
    let email: RawEmail
    try {
      email = await fetchEmail(accessToken, id)
      fetched++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Quarantine instead of blocking: a stub error row makes the message
      // visible for review AND lets the watermark advance — otherwise one
      // permanently-failing message wedges sync forever. Only a failed stub
      // (transient DB trouble) holds the watermark for retry.
      const { error: stubError } = await supabase.from('email_movements').insert({
        user_id: userId,
        gmail_message_id: id,
        source: 'unknown',
        email_date: new Date().toISOString(),
        status: 'error',
        error_detail: `fetch failed: ${message.slice(0, 300)}`,
      })
      if (stubError && !stubError.message.includes('duplicate')) {
        failures.push(`fetch ${id}: ${message}`)
      } else {
        stagedErrors++
      }
      continue
    }

    const result = parseEmail(email)
    if (result === 'ignore') {
      ignored++
      continue
    }

    let row: Partial<ParsedMovement> & { source: string; status: string; error_detail?: string }
    if (result === null) {
      // Known sender but unparseable — either a routed subject whose body
      // changed, or a subject we don't recognize at all (the bank may have
      // reworded a real notification). Both stage as 'error' for review;
      // silently dropping them would lose movements forever once the
      // watermark advances.
      const source = sourceForEmail(email)
      row = {
        gmail_message_id: email.id,
        source: source ?? 'unknown',
        email_date: email.date,
        raw_snippet: email.body.slice(0, 500),
        status: 'error',
        error_detail: source === null
          ? `unrecognized subject at known sender: "${email.subject.slice(0, 120)}"`
          : 'parser could not extract fields',
      }
      stagedErrors++
    } else {
      row = { ...result, status: 'pending' }
      parsed++
    }

    const { error: insertError } = await supabase
      .from('email_movements')
      .insert({ ...row, user_id: userId })
    if (insertError && !insertError.message.includes('duplicate')) {
      // Same quarantine as fetch failures: try a minimal stub so a
      // constraint-violating row cannot wedge the watermark permanently.
      const { error: stubError } = await supabase.from('email_movements').insert({
        user_id: userId,
        gmail_message_id: email.id,
        source: 'unknown',
        email_date: email.date,
        status: 'error',
        error_detail: `stage failed: ${insertError.message.slice(0, 300)}`,
      })
      if (stubError && !stubError.message.includes('duplicate')) {
        failures.push(`stage ${id}: ${insertError.message}`)
      } else {
        stagedErrors++
      }
    }
  }

  const usdRate = await fetchUsdRate()

  const { data: promoteResult, error: promoteError } = await supabase.rpc(
    'promote_email_movements',
    { p_user_id: userId, p_usd_rate: usdRate },
  )
  if (promoteError) {
    console.error(`gmail-sync: promote failed: ${promoteError.message}`)
    return Response.json(
      { error: `promote failed: ${promoteError.message}`, fetched, parsed },
      { status: 500 },
    )
  }

  // Only advance the watermark on a clean run. A message that failed to fetch
  // or stage is NOT in email_movements; advancing past it would exclude it
  // from every future `after:` query — silent, permanent loss. Keeping the old
  // watermark makes the next run re-list the window (cheap: already-staged
  // ids are skipped via the dedup set) and retry only what failed.
  if (failures.length === 0) {
    await supabase.from('sync_state').upsert({
      user_id: userId,
      gmail_watermark: runStartedAt.toISOString(),
      updated_at: runStartedAt.toISOString(),
    })
  } else {
    for (const f of failures) console.error(`gmail-sync: ${f}`)
    console.error(
      `gmail-sync: ${failures.length} message(s) failed; watermark kept at ${since.toISOString()} for retry`,
    )
  }

  // Cron discards the response body — the log line is the only trace.
  console.log(
    `gmail-sync: fetched=${fetched} parsed=${parsed} ignored=${ignored} staged_errors=${stagedErrors} ` +
    `promoted=${promoteResult?.promoted ?? 0} pending=${promoteResult?.pending ?? 0} ` +
    `errors=${promoteResult?.errors ?? 0} failures=${failures.length}`,
  )

  return Response.json({
    mode: isCronCall ? 'cron' : 'user',
    since: since.toISOString(),
    fetched,
    parsed,
    ignored,
    staged_errors: stagedErrors,
    usd_rate: usdRate,
    promoted: promoteResult?.promoted ?? 0,
    pending: promoteResult?.pending ?? 0,
    errors: (promoteResult?.errors ?? 0) + stagedErrors,
    skipped_existing: promoteResult?.skipped_existing ?? 0,
    failures,
  })
})
