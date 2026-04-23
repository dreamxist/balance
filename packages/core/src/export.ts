import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type TypedClient = SupabaseClient<Database>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>

interface ExportData {
  exported_at: string
  tables: {
    accounts: Record<string, unknown>[]
    transactions: Record<string, unknown>[]
    debts: Record<string, unknown>[]
    categories: Record<string, unknown>[]
    snapshots: Record<string, unknown>[]
    recurring_charges: Record<string, unknown>[]
  }
}

export async function exportAllData(client: TypedClient): Promise<ExportData> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('No authenticated user')

  // recurring_charges not in generated types yet, use untyped client for that table
  const untyped = client as UntypedClient

  const [accounts, transactions, debts, categories, snapshots, recurring] = await Promise.all([
    client.from('accounts').select('*'),
    client.from('transactions').select('*').order('date', { ascending: false }),
    client.from('debts').select('*'),
    client.from('categories').select('*').or(`user_id.eq.${user.id},user_id.is.null`),
    client.from('snapshots').select('*'),
    untyped.from('recurring_charges').select('*'),
  ])

  const results = [accounts, transactions, debts, categories, snapshots, recurring]
  for (const result of results) {
    if (result.error) throw new Error(`Export failed: ${(result.error as { message: string }).message}`)
  }

  return {
    exported_at: new Date().toISOString(),
    tables: {
      accounts: (accounts.data ?? []) as Record<string, unknown>[],
      transactions: (transactions.data ?? []) as Record<string, unknown>[],
      debts: (debts.data ?? []) as Record<string, unknown>[],
      categories: (categories.data ?? []) as Record<string, unknown>[],
      snapshots: (snapshots.data ?? []) as Record<string, unknown>[],
      recurring_charges: (recurring.data ?? []) as Record<string, unknown>[],
    },
  }
}

export function exportTableAsCsv(data: Record<string, unknown>[], _tableName: string): string {
  if (data.length === 0) return ''

  const firstRow = data[0]
  if (!firstRow) return ''

  const headers = Object.keys(firstRow)
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(','),
  )

  return [headers.join(','), ...rows].join('\n')
}

export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
