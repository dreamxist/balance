import type { SupabaseClient, Database } from '@balance/core'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export async function resolveAccountId(
  client: SupabaseClient<Database>,
  accountRef: string,
): Promise<string> {
  if (isUuid(accountRef)) return accountRef

  const { data, error } = await client
    .from('accounts')
    .select('id, name')
    .eq('is_archived', false)
    .ilike('name', `%${accountRef}%`)
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(`No account matches "${accountRef}"`)
  }
  if (data.length > 1) {
    const names = data.map((a) => a.name).join(', ')
    throw new Error(`Ambiguous account "${accountRef}". Matches: ${names}`)
  }
  const match = data[0]
  if (!match) throw new Error(`No account matches "${accountRef}"`)
  return match.id
}
