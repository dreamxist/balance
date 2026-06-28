import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type ChargeResult = string

interface ProcessContext {
  supabase: SupabaseClient
  currentDay: number
  currentMonth: string
  todayStr: string
  endOfMonthStr: string
}

// Hash a user_id to a short opaque tag so logs are still useful for debugging
// without leaking raw UUIDs.
async function shortUserTag(userId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `u_${hex.slice(0, 8)}`
}

interface ProcessedCharge {
  name: string
  status: string
  amount?: number
  reason?: string
}

// Process recurring charges for a single user. Always scoped to that user_id.
//
// All the logic (which charges are due, catch-up for past days this month,
// ledger-based dedup, ownership re-check) lives in the SECURITY DEFINER RPC
// process_due_recurring_charges. The cron runs with service_role
// (auth.uid() = NULL), so it MUST pass p_user_id explicitly — the RPC guard
// then trusts it. This is also what fixes the 42501 failures introduced when
// create_transaction was hardened to require auth.uid() = account owner: the
// RPC reuses the low-level primitives instead of create_transaction.
//
// Only automatic charges are processed here (p_include_manual: false); manual
// charges are the user's responsibility (paid via pay_recurring_charge).
async function processChargesForUser(
  ctx: ProcessContext,
  userId: string,
): Promise<ChargeResult[]> {
  const tag = await shortUserTag(userId)

  const { data, error } = await ctx.supabase.rpc('process_due_recurring_charges', {
    p_as_of: ctx.todayStr,
    p_include_manual: false,
    p_user_id: userId,
  })

  if (error) {
    return [`[${tag}] process error: ${error.message}`]
  }

  const charges = ((data?.charges ?? []) as ProcessedCharge[])
  return charges.map((c) => {
    if (c.status === 'charged') return `[${tag}] ${c.name}: charged $${c.amount}`
    if (c.status === 'skipped') return `[${tag}] ${c.name}: skipped (${c.reason})`
    return `[${tag}] ${c.name}: ${c.status}`
  })
}

// Process debt payments for a single user.
async function processDebtsForUser(
  ctx: ProcessContext,
  userId: string,
): Promise<ChargeResult[]> {
  const results: ChargeResult[] = []
  const tag = await shortUserTag(userId)

  const { data: debts, error: debtsError } = await ctx.supabase
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (debtsError) {
    results.push(`[${tag}] debts query error: ${debtsError.message}`)
    return results
  }

  for (const debt of debts ?? []) {
    if (debt.user_id !== userId) {
      results.push(`[${tag}] skipped debt with mismatched user_id`)
      continue
    }
    if (debt.installments_paid >= debt.installments) continue

    const { data: existingPayment } = await ctx.supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'debt_payment')
      .eq('debt_id', debt.id)
      .gte('date', `${ctx.currentMonth}-01`)
      .lte('date', ctx.endOfMonthStr)
      .limit(1)

    if (existingPayment && existingPayment.length > 0) {
      results.push(`[${tag}] Cuota ${debt.description}: already paid`)
      continue
    }

    // pay_debt_installment derives user_id from the debt row. We've already
    // validated debt.user_id === userId above.
    const { error: payError } = await ctx.supabase.rpc('pay_debt_installment', {
      p_debt_id: debt.id,
      p_date: ctx.todayStr,
    })

    if (payError) {
      results.push(`[${tag}] Cuota ${debt.description}: ERROR ${payError.message}`)
      continue
    }

    const nextInstallment = debt.installments_paid + 1
    results.push(
      `[${tag}] Cuota ${debt.description}: paid (${nextInstallment}/${debt.installments})`,
    )
  }

  return results
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  const bearerToken = authHeader?.replace(/^Bearer\s+/, '')

  // Accept either cron secret (backend/cron) or valid user JWT (manual sync
  // from app). If cronSecret is unset we never treat any caller as cron — JWT
  // path still works, and we never fall back to "any caller is cron".
  const isCronCall = !!(cronSecret && bearerToken && bearerToken === cronSecret)
  let authenticatedUserId: string | null = null

  if (!isCronCall && bearerToken) {
    const authClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error } = await authClient.auth.getUser(bearerToken)
    if (user && !error) {
      authenticatedUserId = user.id
    }
  }

  if (!isCronCall && !authenticatedUserId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const todayStr = `${currentMonth}-${String(currentDay).padStart(2, '0')}`

  // Compute actual last day of current month (fixes -31 bug for Feb/Apr/etc)
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const endOfMonthStr = `${currentMonth}-${String(lastDayOfMonth).padStart(2, '0')}`

  const ctx: ProcessContext = {
    supabase,
    currentDay,
    currentMonth,
    todayStr,
    endOfMonthStr,
  }

  const results: ChargeResult[] = []
  const DEBT_DAY = 17

  // Determine which user_ids we will process. In cron mode iterate all users
  // that have at least one active recurring_charge or active debt. In user JWT
  // mode, restrict strictly to the JWT subject.
  let userIds: string[]

  if (isCronCall) {
    const userIdSet = new Set<string>()

    const { data: chargeUsers, error: chargeUsersErr } = await supabase
      .from('recurring_charges')
      .select('user_id')
      .eq('is_active', true)

    if (chargeUsersErr) {
      return Response.json({ error: chargeUsersErr.message }, { status: 500 })
    }
    for (const row of chargeUsers ?? []) {
      if (row.user_id) userIdSet.add(row.user_id as string)
    }

    if (currentDay === DEBT_DAY) {
      const { data: debtUsers, error: debtUsersErr } = await supabase
        .from('debts')
        .select('user_id')
        .eq('status', 'active')

      if (debtUsersErr) {
        return Response.json({ error: debtUsersErr.message }, { status: 500 })
      }
      for (const row of debtUsers ?? []) {
        if (row.user_id) userIdSet.add(row.user_id as string)
      }
    }

    userIds = [...userIdSet]
  } else {
    userIds = [authenticatedUserId as string]
  }

  for (const userId of userIds) {
    const tag = await shortUserTag(userId)
    try {
      const chargeResults = await processChargesForUser(ctx, userId)
      results.push(...chargeResults)

      if (currentDay === DEBT_DAY) {
        const debtResults = await processDebtsForUser(ctx, userId)
        results.push(...debtResults)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[${tag}] processing failed:`, message)
      results.push(`[${tag}] processing failed: ${message}`)
    }
  }

  return Response.json({
    date: todayStr,
    day: currentDay,
    mode: isCronCall ? 'cron' : 'user',
    users_processed: userIds.length,
    processed: results.length,
    results,
  })
})
