import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient as UntypedClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

type TransactionRow = Database['public']['Tables']['transactions']['Row']
type AccountRow = Database['public']['Tables']['accounts']['Row']

export interface SpaDashboardData {
  accounts: AccountRow[]
  ivaDue: number
  monthlyIncome: number
  monthlyExpenses: number
}

export interface SpaInvoice {
  id: string
  client: string
  net: number
  iva: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue'
  paidAmount: number
  description: string
  date: string
}

export async function getSpaDashboard(supabase: TypedClient): Promise<SpaDashboardData> {
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .eq('entity', 'spa')
    .eq('is_archived', false)
    .order('created_at')
  if (accountsError) throw accountsError

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const startDate = `${month}-01`
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('entity', 'spa')
    .gte('date', startDate)
    .lte('date', endDate)
  if (txError) throw txError

  let monthlyIncome = 0
  let monthlyExpenses = 0

  for (const tx of transactions ?? []) {
    if (tx.type === 'income') {
      monthlyIncome += tx.amount
    } else if (tx.type === 'expense') {
      monthlyExpenses += tx.amount
    }
  }

  // IVA real del período = IVA neto del F29 (débito de facturas afectas − crédito).
  // Reusa get_f29_summary para respetar el doc_type: las facturas exentas y de
  // exportación tienen iva = 0, así que no inflan el débito (antes esto era
  // monthlyIncome * 0.19, que cobraba IVA sobre ingresos exentos/exportación).
  const f29 = await getF29Summary(supabase, now.getFullYear(), now.getMonth() + 1)
  const ivaDue = f29.iva_neto

  return { accounts: accounts ?? [], ivaDue, monthlyIncome, monthlyExpenses }
}

export async function getSpaInvoices(supabase: TypedClient): Promise<SpaInvoice[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('entity', 'spa')
    .eq('type', 'income')
    .order('date', { ascending: false })
  if (error) throw error

  return (data ?? []).map(parseInvoiceFromTransaction).filter((inv): inv is SpaInvoice => inv !== null)
}

function parseInvoiceFromTransaction(tx: TransactionRow): SpaInvoice | null {
  const metadata = tx.metadata as Record<string, unknown> | null
  if (metadata?.invoice) {
    return {
      id: tx.id,
      client: String(metadata.client ?? ''),
      net: Number(metadata.net ?? 0),
      iva: Number(metadata.iva ?? 0),
      total: Number(metadata.total ?? tx.amount),
      status: (metadata.status as SpaInvoice['status']) ?? 'draft',
      paidAmount: Number(metadata.paid_amount ?? 0),
      description: tx.description,
      date: tx.date,
    }
  }

  const descMatch = tx.description.match(/^FAC (.+?) \| Neto: (\d+) \| IVA: (\d+) \| Total: (\d+)$/)
  if (descMatch) {
    return {
      id: tx.id,
      client: descMatch[1] ?? '',
      net: Number(descMatch[2]),
      iva: Number(descMatch[3]),
      total: Number(descMatch[4]),
      status: 'draft',
      paidAmount: 0,
      description: tx.description,
      date: tx.date,
    }
  }

  return null
}

export async function createSpaInvoice(supabase: TypedClient, input: {
  client: string
  netAmount: number
  accountId: string
  description: string
  date?: string
}) {
  const iva = Math.round(input.netAmount * 0.19)
  const total = input.netAmount + iva

  const { data, error } = await supabase.rpc('create_transaction', {
    p_amount: total,
    p_category: 'Facturacion',
    p_account_id: input.accountId,
    p_description: `FAC ${input.client} | Neto: ${input.netAmount} | IVA: ${iva} | Total: ${total}`,
    p_type: 'income',
    p_date: input.date ?? undefined,
  })
  if (error) throw error
  return data
}

export async function getSpaExpenses(supabase: TypedClient) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('entity', 'spa')
    .eq('type', 'expense')
    .order('date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getSpaProfit(supabase: TypedClient, year?: number) {
  const targetYear = year ?? new Date().getFullYear()
  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('entity', 'spa')
    .in('type', ['income', 'expense'])
    .gte('date', startDate)
    .lte('date', endDate)
  if (error) throw error

  let profit = 0
  for (const tx of data ?? []) {
    profit += tx.amount
  }

  return { profit, year: targetYear }
}

// === SpA Invoices (v2) ===

export type DocumentType = 'factura_afecta' | 'factura_exenta' | 'boleta'
  | 'factura_exportacion' | 'nota_credito' | 'nota_debito'
export type InvoiceDirection = 'emitida' | 'recibida'

export interface SpaInvoiceRow {
  id: string
  direction: InvoiceDirection
  doc_type: DocumentType
  counterpart: string
  description: string
  neto: number
  iva: number
  total: number
  folio_sii: string | null
  date: string
  status: 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue'
  in_rcv: boolean
  transaction_id: string | null
  created_at: string
}

export interface F29Declaration {
  declared_at: string
  confirmation_number: string | null
  notes: string | null
}

export interface F29Summary {
  year: number
  month: number
  iva_debito: number
  iva_credito: number
  remanente_anterior: number
  credito_total: number
  iva_neto: number
  remanente_siguiente: number
  ppm: number
  f29_total: number
  bruto: number
  deadline: string
  declared: F29Declaration | null
}

export interface MarkF29DeclaredInput {
  year: number
  month: number
  declaredAt?: string
  confirmationNumber?: string
  notes?: string
  /** Raw SII F29 codes (e.g. { "538": 380000, "537": 2278, "091": 380355 }).
   *  When provided, the official values win over the app's estimate. */
  officialCodes?: Record<string, number>
}

export interface AnnualSummary {
  year: number
  ventas_neto: number
  ventas_iva: number
  compras_neto: number
  compras_iva: number
  total_ppm: number
  utilidad: number
  meses: Array<{
    month: number
    debito: number
    credito: number
    remanente: number
    ppm: number
    f29_total: number
  }>
}

export interface CreateInvoiceInput {
  direction: InvoiceDirection
  counterpart: string
  neto: number
  docType?: DocumentType
  description?: string
  folioSii?: string
  date?: string
  accountId?: string
  createTransaction?: boolean
}

function monthRange(month: string): { start: string; nextStart: string } {
  const [yStr, mStr] = month.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    nextStart: `${nextY}-${String(nextM).padStart(2, '0')}-01`,
  }
}

export async function getSpaEmitidas(supabase: TypedClient, month?: string): Promise<SpaInvoiceRow[]> {
  let query = supabase.from('spa_invoices').select('*')
    .eq('direction', 'emitida').order('date', { ascending: false })
  if (month) {
    const { start, nextStart } = monthRange(month)
    query = query.gte('date', start).lt('date', nextStart)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as SpaInvoiceRow[]
}

export async function getSpaRecibidas(supabase: TypedClient, month?: string): Promise<SpaInvoiceRow[]> {
  let query = supabase.from('spa_invoices').select('*')
    .eq('direction', 'recibida').order('date', { ascending: false })
  if (month) {
    const { start, nextStart } = monthRange(month)
    query = query.gte('date', start).lt('date', nextStart)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as SpaInvoiceRow[]
}

export async function createSpaInvoiceV2(supabase: TypedClient, input: CreateInvoiceInput) {
  const { data, error } = await supabase.rpc('create_spa_invoice', {
    p_direction: input.direction,
    p_counterpart: input.counterpart,
    p_neto: input.neto,
    p_doc_type: input.docType ?? 'factura_afecta',
    p_description: input.description ?? '',
    p_folio_sii: input.folioSii ?? undefined,
    p_date: input.date ?? undefined,
    p_account_id: input.accountId ?? undefined,
    p_create_transaction: input.createTransaction ?? false,
  })
  if (error) throw error
  return data as SpaInvoiceRow
}

export async function markSpaInvoicePaid(supabase: TypedClient, invoiceId: string, accountId: string) {
  const { data, error } = await supabase.rpc('mark_invoice_paid', {
    p_invoice_id: invoiceId,
    p_account_id: accountId,
  })
  if (error) throw error
  return data as SpaInvoiceRow
}

export async function getF29Summary(supabase: TypedClient, year: number, month: number): Promise<F29Summary> {
  const { data, error } = await supabase.rpc('get_f29_summary', {
    p_year: year,
    p_month: month,
  })
  if (error) throw error
  return data as unknown as F29Summary
}

export async function getSpaAnnualSummary(supabase: TypedClient, year: number): Promise<AnnualSummary> {
  const { data, error } = await supabase.rpc('get_spa_annual_summary', {
    p_year: year,
  })
  if (error) throw error
  return data as unknown as AnnualSummary
}

// === Factura file upload ===

export async function uploadFacturaFile(
  supabase: TypedClient,
  invoiceId: string,
  file: File,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new Error('No autenticado')

  const ext = file.name.split('.').pop() ?? 'pdf'
  const path = `${userId}/${invoiceId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('facturas')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from('spa_invoices')
    .update({ factura_url: path })
    .eq('id', invoiceId)
  if (updateError) throw updateError

  return path
}

export async function getFacturaSignedUrl(
  supabase: TypedClient,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('facturas')
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// === Reimbursables (gastos personales asociados a SpA) ===

export interface ReimbursableRow {
  id: string
  date: string
  amount: number
  description: string
  category: string | null
  account_id: string
  account_name: string
  linked_invoice_id: string | null
  invoice_counterpart: string | null
  invoice_total: number | null
}

export async function getSpaReimbursables(supabase: TypedClient): Promise<ReimbursableRow[]> {
  const { data, error } = await supabase
    .from('spa_reimbursables')
    .select('*')
  if (error) throw error
  return (data ?? []) as unknown as ReimbursableRow[]
}

export async function linkTransactionToInvoice(
  supabase: TypedClient,
  transactionId: string,
  invoiceId: string,
  reimbursable = true,
) {
  const { data, error } = await supabase.rpc('link_transaction_to_invoice', {
    p_transaction_id: transactionId,
    p_invoice_id: invoiceId,
    p_reimbursable: reimbursable,
  })
  if (error) throw error
  return data
}

export async function markF29Declared(supabase: TypedClient, input: MarkF29DeclaredInput) {
  // p_official_codes added in migration 00031; call through an untyped client
  // until generated types are regenerated against the new function signature.
  const client = supabase as unknown as UntypedClient
  const { data, error } = await client.rpc('mark_f29_declared', {
    p_year: input.year,
    p_month: input.month,
    p_declared_at: input.declaredAt ?? undefined,
    p_confirmation_number: input.confirmationNumber ?? undefined,
    p_notes: input.notes ?? undefined,
    p_official_codes: input.officialCodes ?? undefined,
  })
  if (error) throw error
  return data
}
