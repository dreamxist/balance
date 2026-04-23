import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { InlineBalanceEdit } from '@/components/transactions/inline-balance-edit'

interface BankGroupAccount {
  id: string
  name: string
  label: string
  balance: number
}

interface BankGroup {
  bank: string
  total: number
  accounts: BankGroupAccount[]
}

interface BankGroupCardProps {
  title: string
  total: number
  groups: BankGroup[]
  isLoading: boolean
  className?: string
}

export function BankGroupCard({ title, total, groups, isLoading, className }: BankGroupCardProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-md border border-border bg-card p-4 md:p-5', className)}>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-3 h-7 w-32" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-md border border-border bg-card p-4 md:p-5', className)}>
      <span className="text-sm text-muted-foreground">{title}</span>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        <AnimatedNumber value={total} className="text-2xl font-semibold" />
      </p>

      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <div key={group.bank}>
            {group.accounts.length === 1 ? (
              <div className="flex h-11 items-center justify-between rounded-sm px-2 hover:bg-muted">
                <span className="text-sm text-foreground">{group.bank}</span>
                <InlineBalanceEdit
                  value={group.accounts[0]!.balance}
                  accountId={group.accounts[0]!.id}
                  accountName={group.accounts[0]!.name}
                />
              </div>
            ) : (
              <div className="rounded-sm border border-border/50">
                <div className="flex h-9 items-center justify-between px-3">
                  <span className="text-sm font-medium text-foreground">{group.bank}</span>
                  <span className={cn(
                    'font-mono text-sm tabular-nums',
                    group.total < 0 ? 'text-red-500' : 'text-muted-foreground',
                  )}>
                    {formatMoney(group.total)}
                  </span>
                </div>
                <div className="border-t border-border/50">
                  {group.accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex h-11 items-center justify-between px-3 pl-5 hover:bg-muted"
                    >
                      <span className="text-xs text-muted-foreground">{acc.label}</span>
                      <InlineBalanceEdit
                        value={acc.balance}
                        accountId={acc.id}
                        accountName={acc.name}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
