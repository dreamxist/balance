import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getFintualPrice, calculateBalance } from '@/lib/fintual'
import { useAccounts } from './use-accounts'
import { supabase } from '@/lib/supabase'

interface FintualAccount {
  id: string
  name: string
  fintualAssetId: number
  shares: number
  currentBalance: number
}

function extractFintualAccounts(accounts: Array<{
  id: string
  name: string
  balance: number | null
  metadata: unknown
}>): FintualAccount[] {
  return accounts
    .filter((a) => {
      const meta = a.metadata as Record<string, unknown> | null
      return meta?.fintual_asset_id != null && meta?.shares != null
    })
    .map((a) => {
      const meta = a.metadata as Record<string, unknown>
      return {
        id: a.id,
        name: a.name,
        fintualAssetId: meta.fintual_asset_id as number,
        shares: meta.shares as number,
        currentBalance: a.balance ?? 0,
      }
    })
}

export function useFintualSync() {
  const accounts = useAccounts()
  const queryClient = useQueryClient()

  const fintualAccounts = extractFintualAccounts(accounts.data ?? [])
  const assetIds = fintualAccounts.map((a) => a.fintualAssetId)

  const pricesQuery = useQuery({
    queryKey: ['fintual-prices', ...assetIds],
    queryFn: async () => {
      const prices = await Promise.all(
        fintualAccounts.map(async (acc) => {
          const day = await getFintualPrice(acc.fintualAssetId)
          return { accountId: acc.id, assetId: acc.fintualAssetId, day, shares: acc.shares }
        }),
      )
      return prices
    },
    enabled: fintualAccounts.length > 0,
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchInterval: 10 * 60 * 1000, // refetch every 10 min
  })

  // Auto-update account balances when prices change
  useEffect(() => {
    if (!pricesQuery.data) return

    for (const price of pricesQuery.data) {
      if (!price.day) continue
      const acc = fintualAccounts.find((a) => a.id === price.accountId)
      if (!acc) continue

      const newBalance = calculateBalance(price.shares, price.day.price)
      if (Math.abs(newBalance - acc.currentBalance) > 100) {
        // Update balance directly — NO adjustment transaction (off-budget)
        void supabase
          .from('accounts')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('id', acc.id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
          })
      }
    }
  }, [pricesQuery.data, fintualAccounts, queryClient])

  return {
    isLoading: pricesQuery.isLoading,
    lastUpdated: pricesQuery.data?.[0]?.day?.date ?? null,
    prices: pricesQuery.data ?? [],
  }
}
