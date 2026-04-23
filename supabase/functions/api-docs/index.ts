const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('AUTH_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-api-key, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Tables and views the bot can read
const ALLOWED_TABLES = [
  'accounts', 'transactions', 'debts', 'categories', 'snapshots',
  'recurring_charges', 'profiles', 'api_keys',
  'active_debts', 'credit_card_status', 'monthly_summary', 'reconciliation_status',
]

// RPC functions the bot can call
const ALLOWED_RPC = [
  'create_transaction', 'create_transfer', 'create_inter_entity_transfer',
  'create_account', 'archive_account', 'rename_account', 'update_account_balance_manual',
  'create_installment_purchase', 'pay_debt_installment', 'pay_off_debt', 'archive_debt',
  'create_snapshot', 'get_snapshot_history', 'get_reconciliation_status',
  'create_subcategory', 'rename_category', 'delete_category',
  'create_opening_balance', 'undo_transaction', 'receive_payment',
]

interface SchemaCache {
  data: Record<string, unknown> | null
  fetchedAt: number
}

const cache: SchemaCache = { data: null, fetchedAt: 0 }
const CACHE_TTL = 3600_000 // 1 hour

async function getFilteredSchema(): Promise<Record<string, unknown>> {
  const now = Date.now()
  if (cache.data && now - cache.fetchedAt < CACHE_TTL) {
    return cache.data
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch schema: ${res.status}`)
  }

  const full = await res.json() as Record<string, unknown>
  const paths = full.paths as Record<string, unknown> ?? {}
  const definitions = full.definitions as Record<string, unknown> ?? {}

  // Filter paths
  const filteredPaths: Record<string, unknown> = {}
  for (const [path, spec] of Object.entries(paths)) {
    const name = path.replace('/', '').replace('rpc/', '')
    if (path === '/') continue
    if (path.startsWith('/rpc/')) {
      if (ALLOWED_RPC.includes(name)) filteredPaths[path] = spec
    } else {
      if (ALLOWED_TABLES.includes(name)) filteredPaths[path] = spec
    }
  }

  // Filter definitions to only referenced tables
  const filteredDefs: Record<string, unknown> = {}
  for (const name of ALLOWED_TABLES) {
    if (definitions[name]) filteredDefs[name] = definitions[name]
  }

  const filtered = {
    openapi: '3.0.0',
    info: {
      title: 'Balance API',
      description: 'API de finanzas personales Balance. Usa x-api-key header en POST /functions/v1/auth-apikey para obtener un JWT, luego usa ese JWT en Authorization header para todas las queries.',
      version: '1.0.0',
    },
    servers: [{ url: `${supabaseUrl}/rest/v1` }],
    auth: {
      description: 'POST /functions/v1/auth-apikey con header x-api-key: bal_xxx → recibe { access_token, refresh_token, expires_at }. Usar access_token como Bearer token + apikey header (publishable key) en todas las requests.',
      endpoint: `${supabaseUrl}/functions/v1/auth-apikey`,
    },
    paths: filteredPaths,
    definitions: filteredDefs,
    notes: {
      money: 'Todos los montos son integers: CLP en pesos, USD en centavos. Nunca floats.',
      transactions: 'Inmutables — corregir con undo_transaction, nunca update/delete.',
      types: {
        transaction_type: ['income', 'expense', 'refund', 'transfer', 'debt_payment', 'adjustment'],
        account_subtype: ['debit', 'cash', 'credit_card', 'receivable', 'payable', 'investment', 'property'],
        entity_type: ['personal', 'spa'],
      },
      reconciliation: 'position = sum(on_budget balances), accumulated = sum(income - expense - refund - adjustment), delta = position - accumulated. Delta debe ser 0.',
    },
  }

  cache.data = filtered
  cache.fetchedAt = now
  return filtered
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const schema = await getFilteredSchema()
    return Response.json(schema, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
