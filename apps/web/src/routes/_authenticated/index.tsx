import { useState, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EmptyState } from '@/components/ui/empty-state'
import { BentoGrid } from '@/components/layout/app-shell'
import { PatrimonyHero } from '@/components/dashboard/patrimony-hero'
import { DeltaIndicator } from '@/components/dashboard/delta-indicator'
import { BucketCard } from '@/components/dashboard/bucket-card'
import { BankGroupCard } from '@/components/dashboard/bank-group-card'
import { Recommendations } from '@/components/dashboard/recommendations'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Fab } from '@/components/ui/fab'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { useReconciliation } from '@/hooks/use-reconciliation'
import { useAccounts, type Account } from '@/hooks/use-accounts'
import { useMonthlyBreakdown } from '@/hooks/use-monthly-breakdown'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
})

function DashboardPage() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const navigate = useNavigate()
  const reconciliation = useReconciliation()
  const accounts = useAccounts({ entity: 'personal' })
  const monthly = useMonthlyBreakdown()

  const isLoading = reconciliation.isLoading || accounts.isLoading
  const hasError = reconciliation.error ?? accounts.error
  const hasAccounts = (accounts.data?.length ?? 0) > 0

  const buckets = useMemo(() => {
    const data = accounts.data ?? []
    return {
      tengo: data.filter(
        (a) => (a.type === 'asset' && (a.subtype === 'debit' || a.subtype === 'cash')) ||
               a.subtype === 'credit_card',
      ),
      meDeben: data.filter((a) => a.type === 'asset' && a.subtype === 'receivable'),
      debo: data.filter((a) => a.type === 'liability' && a.subtype === 'payable'),
    }
  }, [accounts.data])

  const bankGroups = useMemo(() => groupByBank(buckets.tengo as Account[]), [buckets.tengo])

  const bucketTotals = useMemo(
    () => ({
      tengo: buckets.tengo.reduce((sum, a) => sum + (a.balance ?? 0), 0),
      meDeben: buckets.meDeben.reduce((sum, a) => sum + (a.balance ?? 0), 0),
      debo: buckets.debo.reduce((sum, a) => sum + (a.balance ?? 0), 0),
    }),
    [buckets],
  )

  if (hasError) {
    return (
      <EmptyState
        title="Error al cargar datos"
        description={hasError.message}
        action={{
          label: 'Reintentar',
          onClick: () => {
            void reconciliation.refetch()
            void accounts.refetch()
          },
        }}
      />
    )
  }

  if (!isLoading && !hasAccounts) {
    return (
      <EmptyState
        title="Cuadrar"
        description="Completa el onboarding para ver tu dashboard"
        action={{
          label: 'Comenzar onboarding',
          onClick: () => void navigate({ to: '/onboarding' as string }),
        }}
      />
    )
  }

  const recon = reconciliation.data
  const position = recon?.position ?? 0
  const delta = recon?.delta ?? 0
  const deltaStatus = recon?.delta_status ?? 'green'

  return (
    <div className="space-y-4 md:space-y-6">
      <BentoGrid>
        <PatrimonyHero
          position={position}
          monthly={monthly.data}
          isLoading={isLoading}
        />

        {isLoading ? (
          <SkeletonCard className="col-span-1" />
        ) : (
          <div className="col-span-1 flex items-center justify-center rounded-md border border-border bg-card p-5">
            <DeltaIndicator delta={delta} status={deltaStatus} />
          </div>
        )}

        <BankGroupCard
          title="Tengo"
          total={bucketTotals.tengo}
          groups={bankGroups}
          isLoading={isLoading}
          className="col-span-1 lg:col-span-2"
        />

        <BucketCard
          title="Me deben"
          total={bucketTotals.meDeben}
          accounts={toBucketAccounts(buckets.meDeben)}
          isLoading={isLoading}
          className="col-span-1"
          editable={{ type: 'asset', subtype: 'receivable' }}
        />

        <BucketCard
          title="Debo"
          total={bucketTotals.debo}
          accounts={toBucketAccounts(buckets.debo)}
          isLoading={isLoading}
          className="col-span-1"
          editable={{ type: 'liability', subtype: 'payable' }}
        />

        <Recommendations
          isOnboarded={hasAccounts}
          accountCount={accounts.data?.length ?? 0}
        />
      </BentoGrid>

      <Fab onClick={() => setSheetOpen(true)} />
      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Acciones rapidas">
        <div className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-muted"
            onClick={() => {
              setSheetOpen(false)
              void navigate({ to: '/movimientos', search: { new: 'true' } })
            }}
          >
            Registrar movimiento
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-muted"
            onClick={() => {
              setSheetOpen(false)
              void navigate({ to: '/deudas', search: { new: 'true' } })
            }}
          >
            Nueva compra en cuotas
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

function toBucketAccounts(
  accounts: Array<{ id: string; name: string; balance: number | null }>,
) {
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    balance: a.balance ?? 0,
  }))
}

interface BankGroup {
  bank: string
  total: number
  accounts: Array<{ id: string; name: string; label: string; balance: number }>
}

// Customize this list to group accounts that share a bank keyword in their name.
// Example: { keyword: 'Chase', bank: 'Chase Bank' } groups "Chase Checking" and "TC Chase" together.
const BANK_KEYWORDS: Array<{ keyword: string; bank: string }> = []

function groupByBank(accounts: Account[]): BankGroup[] {
  const groups = new Map<string, BankGroup>()

  for (const acc of accounts) {
    const match = BANK_KEYWORDS.find((k) => acc.name.includes(k.keyword))
    const bank = match?.bank ?? acc.name

    if (!groups.has(bank)) {
      groups.set(bank, { bank, total: 0, accounts: [] })
    }
    const group = groups.get(bank)!
    group.total += acc.balance ?? 0

    let label = acc.name
    if (match) {
      label = acc.name
        .replace(match.keyword, '')
        .replace(/^\s+|\s+$/g, '')
        .replace(/^-\s*/, '')
        .replace(/^CC$/, 'Cuenta Corriente')
        .replace(/^CC /, 'Cuenta Corriente ')
      if (!label) label = acc.subtype === 'credit_card' ? 'Tarjeta crédito' : 'Cuenta Corriente'
      if (acc.subtype === 'credit_card' && !label.toLowerCase().includes('tc')) {
        label = `TC ${label}`
      }
    }

    group.accounts.push({
      id: acc.id,
      name: acc.name,
      label,
      balance: acc.balance ?? 0,
    })
  }

  return Array.from(groups.values())
}
