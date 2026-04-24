import type { Command } from 'commander'
import { getAccounts } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { formatCLP, padLeft, padRight } from '../lib/format'

const FINTUAL_API = 'https://fintual.cl/api/real_assets'

interface FintualDay {
  date: string
  price: number
}

interface FintualAccount {
  id: string
  name: string
  assetId: number
  shares: number
  currentBalance: number
}

async function fetchFintualPrice(assetId: number): Promise<FintualDay | null> {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 5)
  const fromStr = from.toISOString().slice(0, 10)
  const toStr = today.toISOString().slice(0, 10)

  const res = await fetch(`${FINTUAL_API}/${assetId}/days?from_date=${fromStr}&to_date=${toStr}`)
  if (!res.ok) return null
  const json = (await res.json()) as { data: Array<{ attributes: { date: string; price: number } }> }
  const days = json.data ?? []
  if (days.length === 0) return null
  const latest = days[days.length - 1]!
  return { date: latest.attributes.date, price: latest.attributes.price }
}

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return null
}

export function extractFintualAccounts(
  accounts: Array<{ id: string; name: string; balance: number | null; metadata: unknown }>,
): FintualAccount[] {
  return accounts
    .map((a) => {
      const meta = parseMetadata(a.metadata)
      if (meta?.fintual_asset_id == null || meta?.shares == null) return null
      return {
        id: a.id,
        name: a.name,
        assetId: meta.fintual_asset_id as number,
        shares: meta.shares as number,
        currentBalance: a.balance ?? 0,
      }
    })
    .filter((a): a is FintualAccount => a !== null)
}

interface SyncOptions {
  dryRun?: boolean
  json?: boolean
}

function registerSync(group: Command): void {
  group
    .command('sync')
    .description('Pull latest Fintual prices and update account balances for off-budget funds')
    .option('--dry-run', 'show what would change without writing')
    .option('--json', 'output JSON')
    .action(async (opts: SyncOptions) => {
      const client = await getAuthedClient()
      const accounts = (await getAccounts(client)) ?? []
      const fintual = extractFintualAccounts(
        accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance, metadata: a.metadata })),
      )

      if (fintual.length === 0) {
        if (opts.json) {
          process.stdout.write(JSON.stringify({ updated: [] }) + '\n')
        } else {
          process.stdout.write('(no Fintual-linked accounts found)\n')
        }
        return
      }

      const results: Array<{
        name: string
        assetId: number
        shares: number
        price?: number
        date?: string
        oldBalance: number
        newBalance?: number
        delta?: number
        updated: boolean
      }> = []

      for (const acc of fintual) {
        const day = await fetchFintualPrice(acc.assetId)
        if (!day) {
          results.push({
            name: acc.name,
            assetId: acc.assetId,
            shares: acc.shares,
            oldBalance: acc.currentBalance,
            updated: false,
          })
          continue
        }
        const newBalance = Math.round(acc.shares * day.price)
        const delta = newBalance - acc.currentBalance
        let updated = false
        if (!opts.dryRun && Math.abs(delta) > 100) {
          const { error } = await client
            .from('accounts')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', acc.id)
          if (error) throw error
          updated = true
        }
        results.push({
          name: acc.name,
          assetId: acc.assetId,
          shares: acc.shares,
          price: day.price,
          date: day.date,
          oldBalance: acc.currentBalance,
          newBalance,
          delta,
          updated,
        })
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ dryRun: !!opts.dryRun, results }) + '\n')
        return
      }

      const lines: string[] = []
      lines.push(
        `${padRight('ACCOUNT', 26)}${padLeft('OLD', 14)}${padLeft('NEW', 14)}${padLeft('Δ', 12)}${padLeft('PRICE', 12)}  DATE`,
      )
      for (const r of results) {
        lines.push(
          padRight(r.name, 26) +
            padLeft(formatCLP(r.oldBalance), 14) +
            padLeft(r.newBalance != null ? formatCLP(r.newBalance) : '—', 14) +
            padLeft(r.delta != null ? formatCLP(r.delta) : '—', 12) +
            padLeft(r.price != null ? r.price.toFixed(2) : '—', 12) +
            '  ' +
            (r.date ?? '—') +
            (r.updated ? '  ✓' : ''),
        )
      }
      if (opts.dryRun) lines.push('\n(dry run — no changes written)')
      process.stdout.write(lines.join('\n') + '\n')
    })
}

export function registerFintualCommand(program: Command): void {
  const group = program.command('fintual').description('Fintual investment sync')
  registerSync(group)
}
