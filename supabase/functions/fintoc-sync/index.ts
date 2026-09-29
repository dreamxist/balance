// fintoc-sync: pulls checking-account movements from the Fintoc Movements API,
// stages them in email_movements and promotes them into transactions.
//
// Auth mirrors gmail-sync: CRON_SECRET (fail-closed) or the owner's JWT for
// `bal sync`. There is one Fintoc Link (one bank login), so only its owner
// (FINTOC_USER_ID) may sync it.
//
// Secrets:
//   FINTOC_SECRET_KEY    sk_live_… of the Fintoc organization
//   FINTOC_LINK_TOKEN    link_…_token_… of the connected Link
//   FINTOC_USER_ID       owner's auth.users id (cron is single-user)
//   FINTOC_CUTOVER_DATE  YYYY-MM-DD; first day Fintoc owns the checking account.
//                        gmail-sync skips that account's emails from this day on.
//   FINTOC_TC_LAST4      optional; card paid by "Cargo Por Pago Tc" /
//                        "Pago Tarjeta De Credito" (without it they stage as error)
//
// When the Fintoc secrets are unset the function reports configured=false and
// does nothing, so `bal sync` works for installs without Fintoc.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mapMovement, stagedIdFor, type FintocMovement } from './mapper.ts'
import { recordSyncOutcome } from '../_shared/sync-health.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FINTOC_API = 'https://api.fintoc.com/v1'
const PER_PAGE = 300
// Banks post movements late; re-list a few days behind the watermark. Already
// staged ids are skipped, so the overlap only costs API calls.
const OVERLAP_DAYS = 3

interface FintocAccount {
  id: string
  number: string
  currency: string
  type: string
}

interface FintocLink {
  status: string
  refresh_status?: string
  last_time_refreshed?: string | null
}

async function fintocGet<T>(path: string, secretKey: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${FINTOC_API}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: secretKey } })
  if (!res.ok) {
    throw new Error(`Fintoc ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  }
  return await res.json() as T
}

async function listMovements(
  secretKey: string,
  linkToken: string,
  accountId: string,
  since: string,
): Promise<FintocMovement[]> {
  const all: FintocMovement[] = []
  for (let page = 1; ; page++) {
    const batch = await fintocGet<FintocMovement[]>(`/accounts/${accountId}/movements`, secretKey, {
      link_token: linkToken,
      since,
      per_page: String(PER_PAGE),
      page: String(page),
    })
    all.push(...batch)
    if (batch.length < PER_PAGE) return all
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())
}

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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

  const secretKey = Deno.env.get('FINTOC_SECRET_KEY')
  const linkToken = Deno.env.get('FINTOC_LINK_TOKEN')
  if (!secretKey || !linkToken) {
    return Response.json({ configured: false })
  }

  const owner = Deno.env.get('FINTOC_USER_ID') ?? null
  if (!isCronCall && authenticatedUserId !== owner) {
    console.error(`fintoc-sync: JWT user ${authenticatedUserId} is not the link owner`)
    return new Response('Forbidden: not the Fintoc link owner', { status: 403 })
  }
  const userId = isCronCall ? owner : authenticatedUserId
  if (!userId) {
    return Response.json({ error: 'FINTOC_USER_ID secret is required' }, { status: 400 })
  }

  const cutover = Deno.env.get('FINTOC_CUTOVER_DATE') ?? ''
  if (!isIsoDate(cutover)) {
    return Response.json(
      { error: 'FINTOC_CUTOVER_DATE (YYYY-MM-DD) is required: it splits the checking account between gmail-sync and fintoc-sync' },
      { status: 400 },
    )
  }
  const cardLast4 = Deno.env.get('FINTOC_TC_LAST4')?.trim() || null

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let link: FintocLink
  try {
    link = await fintocGet<FintocLink>(`/links/${linkToken}`, secretKey, {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`fintoc-sync: ${message}`)
    await recordSyncOutcome(supabase, userId, 'fintoc', message)
    return Response.json({ configured: true, error: message }, { status: 502 })
  }
  if (link.status !== 'active') {
    // login_required: the bank password changed or the bank asked to
    // re-authenticate. Nothing new will arrive until the Link is reconnected.
    const message = `Fintoc link status is ${link.status}: reconnect the bank in Fintoc`
    console.error(`fintoc-sync: ${message}`)
    await recordSyncOutcome(supabase, userId, 'fintoc', message)
    return Response.json({ configured: true, link_status: link.status, error: message }, { status: 409 })
  }

  const { data: state } = await supabase
    .from('sync_state')
    .select('fintoc_watermark')
    .eq('user_id', userId)
    .maybeSingle()
  const watermark = state?.fintoc_watermark as string | null | undefined
  const overlapStart = watermark ? shiftDays(watermark, -OVERLAP_DAYS) : cutover
  const effectiveSince = overlapStart > cutover ? overlapStart : cutover
  const runDate = new Date().toISOString().slice(0, 10)

  let fetched = 0
  let staged = 0
  let ignored = 0
  let stagedErrors = 0
  const failures: string[] = []

  let accounts: FintocAccount[]
  try {
    accounts = await fintocGet<FintocAccount[]>('/accounts', secretKey, { link_token: linkToken })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`fintoc-sync: ${message}`)
    await recordSyncOutcome(supabase, userId, 'fintoc', message)
    return Response.json({ configured: true, error: message }, { status: 502 })
  }

  for (const account of accounts) {
    let movements: FintocMovement[]
    try {
      movements = await listMovements(secretKey, linkToken, account.id, effectiveSince)
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err))
      continue
    }
    // `since` filters by post_date on Fintoc's side; keep the cutover exact
    // regardless of how the API rounds dates.
    movements = movements.filter((m) => m.post_date.slice(0, 10) >= cutover)
    fetched += movements.length
    if (movements.length === 0) continue

    const seen = new Set<string>()
    const ids = movements.map((m) => stagedIdFor(m.id))
    for (let i = 0; i < ids.length; i += 200) {
      const { data: existing, error } = await supabase
        .from('email_movements')
        .select('gmail_message_id')
        .eq('user_id', userId)
        .in('gmail_message_id', ids.slice(i, i + 200))
      if (error) {
        failures.push(`dedup lookup: ${error.message}`)
        continue
      }
      for (const row of existing ?? []) seen.add(row.gmail_message_id as string)
    }

    for (const m of movements) {
      if (seen.has(stagedIdFor(m.id))) continue
      const row = mapMovement(m, { accountNumber: account.number, cardLast4 })
      if (row === 'ignore') {
        ignored++
        continue
      }
      const { error } = await supabase.from('email_movements').insert({ ...row, user_id: userId })
      if (error && !error.message.includes('duplicate')) {
        failures.push(`stage ${m.id}: ${error.message}`)
        continue
      }
      if (row.status === 'error') stagedErrors++
      else staged++
    }
  }

  const { data: promoteResult, error: promoteError } = await supabase.rpc(
    'promote_email_movements',
    { p_user_id: userId, p_usd_rate: null },
  )
  if (promoteError) {
    console.error(`fintoc-sync: promote failed: ${promoteError.message}`)
    await recordSyncOutcome(supabase, userId, 'fintoc', `promote failed: ${promoteError.message}`)
    return Response.json(
      { configured: true, error: `promote failed: ${promoteError.message}`, fetched, staged },
      { status: 500 },
    )
  }

  // Same rule as gmail-sync: a failed page or insert keeps the watermark so
  // the next run re-lists the window; staged ids make the retry idempotent.
  if (failures.length === 0) {
    await supabase.from('sync_state').upsert({
      user_id: userId,
      fintoc_watermark: runDate,
      updated_at: new Date().toISOString(),
    })
    await recordSyncOutcome(supabase, userId, 'fintoc', null)
  } else {
    for (const f of failures) console.error(`fintoc-sync: ${f}`)
    await recordSyncOutcome(supabase, userId, 'fintoc', `${failures.length} failure(s): ${failures[0]}`)
  }

  console.log(
    `fintoc-sync: since=${effectiveSince} fetched=${fetched} staged=${staged} ignored=${ignored} ` +
    `staged_errors=${stagedErrors} promoted=${promoteResult?.promoted ?? 0} ` +
    `skipped_existing=${promoteResult?.skipped_existing ?? 0} errors=${promoteResult?.errors ?? 0} ` +
    `failures=${failures.length}`,
  )

  return Response.json({
    configured: true,
    mode: isCronCall ? 'cron' : 'user',
    link_status: link.status,
    last_refreshed: link.last_time_refreshed ?? null,
    since: effectiveSince,
    fetched,
    staged,
    ignored,
    staged_errors: stagedErrors,
    promoted: promoteResult?.promoted ?? 0,
    pending: promoteResult?.pending ?? 0,
    errors: (promoteResult?.errors ?? 0) + stagedErrors,
    skipped_existing: promoteResult?.skipped_existing ?? 0,
    failures,
  })
})
