import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const RETENTION_DAYS = 30

Deno.serve(async (req) => {
  // Verify cron secret. Fail closed: if CRON_SECRET is not configured the
  // endpoint refuses every call instead of being silently public — this
  // function dumps every user's full data via service_role.
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.error('daily-backup invoked without CRON_SECRET configured; refusing.')
    return new Response('Server misconfigured', { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const results: Array<{ user_id: string; status: string; file: string }> = []

  // Get all onboarded users
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_onboarded', true)

  if (profilesError) {
    return Response.json({ error: profilesError.message }, { status: 500 })
  }

  for (const profile of profiles ?? []) {
    const userId = profile.id as string

    try {
      // Fetch all user data with service_role (bypasses RLS)
      const [accounts, transactions, debts, categories, snapshots, recurring] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', userId),
        supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('debts').select('*').eq('user_id', userId),
        supabase.from('categories').select('*').or(`user_id.eq.${userId},user_id.is.null`),
        supabase.from('snapshots').select('*').eq('user_id', userId),
        supabase.from('recurring_charges').select('*').eq('user_id', userId),
      ])

      const data = {
        exported_at: new Date().toISOString(),
        user_id: userId,
        tables: {
          accounts: accounts.data ?? [],
          transactions: transactions.data ?? [],
          debts: debts.data ?? [],
          categories: categories.data ?? [],
          snapshots: snapshots.data ?? [],
          recurring_charges: recurring.data ?? [],
        },
      }

      // Upload to Storage
      const filePath = `${userId}/${todayStr}.json`
      const { error: uploadError } = await supabase.storage
        .from('backups')
        .upload(filePath, JSON.stringify(data), {
          contentType: 'application/json',
          upsert: true,
        })

      if (uploadError) {
        results.push({ user_id: userId, status: `upload error: ${uploadError.message}`, file: filePath })
        continue
      }

      results.push({ user_id: userId, status: 'ok', file: filePath })

      // Retention: delete backups older than 30 days
      const { data: files } = await supabase.storage
        .from('backups')
        .list(userId)

      if (files && files.length > 0) {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

        const oldFiles = files.filter((f) => {
          // Filename format: YYYY-MM-DD.json
          const dateStr = f.name.replace('.json', '')
          const fileDate = new Date(dateStr)
          return !isNaN(fileDate.getTime()) && fileDate < cutoffDate
        })

        if (oldFiles.length > 0) {
          const pathsToDelete = oldFiles.map((f) => `${userId}/${f.name}`)
          await supabase.storage.from('backups').remove(pathsToDelete)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ user_id: userId, status: `error: ${message}`, file: '' })
    }
  }

  return Response.json({
    date: todayStr,
    users_processed: results.length,
    results,
  })
})

// Cron: Configure via Supabase Dashboard -> Database -> Extensions -> pg_cron
// Example:
//   select cron.schedule(
//     'daily-backup',
//     '0 3 * * *',
//     $$select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/daily-backup',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')),
//       body := '{}'::jsonb
//     )$$
//   );
