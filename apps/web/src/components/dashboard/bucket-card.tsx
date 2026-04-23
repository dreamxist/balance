import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createAccount, archiveAccount } from '@balance/core'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { InlineBalanceEdit } from '@/components/transactions/inline-balance-edit'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface BucketAccount {
  id: string
  name: string
  balance: number
}

interface BucketCardProps {
  title: string
  total: number
  accounts: BucketAccount[]
  emptyAction?: { label: string; onClick: () => void }
  isLoading: boolean
  className?: string
  editable?: {
    type: 'asset' | 'liability'
    subtype: 'debit' | 'cash' | 'credit_card' | 'receivable' | 'payable' | 'investment' | 'property'
  }
}

export function BucketCard({ title, total, accounts, emptyAction, isLoading, className, editable }: BucketCardProps) {
  const [adding, setAdding] = useState(false)

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
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        {editable && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            + Agregar
          </button>
        )}
      </div>
      <p
        className={cn(
          'mt-1 font-mono text-2xl font-semibold tabular-nums',
          total < 0 ? 'text-red-500' : 'text-foreground',
        )}
      >
        <AnimatedNumber value={total} className="text-2xl font-semibold" />
      </p>

      <div className="mt-4 space-y-0">
        {adding && editable && (
          <InlineAddAccount
            type={editable.type}
            subtype={editable.subtype}
            onDone={() => setAdding(false)}
            onBlurCancel
          />
        )}

        {accounts.map((account) => (
          <div
            key={account.id}
            className="group flex h-11 items-center justify-between rounded-sm px-2 hover:bg-muted"
          >
            <span className="text-sm text-foreground">{account.name}</span>
            <div className="flex items-center gap-1">
              <InlineBalanceEdit
                value={account.balance}
                accountId={account.id}
                accountName={account.name}
              />
              {editable && (
                <ArchiveButton accountId={account.id} accountName={account.name} />
              )}
            </div>
          </div>
        ))}
      </div>

      {accounts.length === 0 && !adding && emptyAction && (
        <button
          type="button"
          onClick={emptyAction.onClick}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          {emptyAction.label}
        </button>
      )}
    </div>
  )
}

function ArchiveButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const queryClient = useQueryClient()
  const mut = useMutation({
    mutationFn: () => archiveAccount(supabase, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      toast.success(`"${accountName}" archivada`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <button
      type="button"
      onClick={() => { if (confirm(`¿Archivar "${accountName}"?`)) mut.mutate() }}
      className="ml-1 hidden text-xs text-muted-foreground hover:text-destructive group-hover:inline"
      disabled={mut.isPending}
    >
      ✕
    </button>
  )
}

function InlineAddAccount({
  type,
  subtype,
  onDone,
  onBlurCancel,
}: {
  type: 'asset' | 'liability'
  subtype: string
  onDone: () => void
  onBlurCancel?: boolean
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('')

  const mut = useMutation({
    mutationFn: () =>
      createAccount(supabase, {
        name,
        type,
        subtype: subtype as 'debit' | 'cash' | 'credit_card' | 'receivable' | 'payable' | 'investment' | 'property',
        balance: balance ? parseInt(balance, 10) : 0,
        onBudget: subtype !== 'investment' && subtype !== 'property',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] })
      toast.success(`"${name}" creada`)
      onDone()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <form
      className="flex items-center gap-1 rounded-sm bg-muted/50 px-2 py-1.5"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) mut.mutate() }}
      onBlur={(e) => {
        if (onBlurCancel && !e.currentTarget.contains(e.relatedTarget as Node) && !name.trim()) {
          onDone()
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        autoFocus
      />
      <input
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        placeholder="$0"
        type="number"
        className="w-20 bg-transparent text-right font-mono text-sm outline-none placeholder:text-muted-foreground"
      />
      <Button size="sm" type="submit" disabled={mut.isPending || !name.trim()} className="h-6 px-2 text-xs">
        OK
      </Button>
      <button type="button" onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
        ✕
      </button>
    </form>
  )
}
