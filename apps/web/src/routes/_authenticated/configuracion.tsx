import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createAccount, archiveAccount, renameAccount } from '@balance/core'
import { useAccounts, type Account } from '@/hooks/use-accounts'
import { useProfile } from '@/hooks/use-profile'
import { useRecurringCharges, useCreateRecurring, useDeleteRecurring, type RecurringCharge } from '@/hooks/use-recurring'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { SkeletonCard } from '@/components/ui/skeleton'
import { SyncButton } from '@/components/sync-button'
import { toast } from 'sonner'
import { formatMoney } from '@/lib/format'
import { ExportSection } from '@/components/configuracion/export-section'
import { ApiKeysSection } from '@/components/configuracion/api-keys-section'

export const Route = createFileRoute('/_authenticated/configuracion')({
  component: ConfiguracionPage,
})

type AccountSubtype = 'debit' | 'cash' | 'credit_card' | 'receivable' | 'payable' | 'investment' | 'property'

const ACCOUNT_GROUPS = [
  {
    title: 'Cuentas',
    description: 'Cuentas bancarias y efectivo',
    subtypes: ['debit', 'cash'] as AccountSubtype[],
    defaultSubtype: 'debit' as AccountSubtype,
    type: 'asset' as const,
  },
  {
    title: 'Tarjetas de Crédito',
    description: 'Tarjetas con saldo por pagar',
    subtypes: ['credit_card'] as AccountSubtype[],
    defaultSubtype: 'credit_card' as AccountSubtype,
    type: 'liability' as const,
  },
  {
    title: 'Me Deben',
    description: 'Cuentas por cobrar',
    subtypes: ['receivable'] as AccountSubtype[],
    defaultSubtype: 'receivable' as AccountSubtype,
    type: 'asset' as const,
  },
  {
    title: 'Inversiones',
    description: 'Fondos, acciones (off-budget)',
    subtypes: ['investment'] as AccountSubtype[],
    defaultSubtype: 'investment' as AccountSubtype,
    type: 'asset' as const,
  },
  {
    title: 'Propiedades',
    description: 'Bienes raíces (off-budget)',
    subtypes: ['property'] as AccountSubtype[],
    defaultSubtype: 'property' as AccountSubtype,
    type: 'asset' as const,
  },
]

const SUBTYPE_LABELS: Record<string, string> = {
  debit: 'Débito',
  cash: 'Efectivo',
  credit_card: 'Tarjeta de crédito',
  receivable: 'Por cobrar',
  payable: 'Por pagar',
  investment: 'Inversión',
  property: 'Propiedad',
}

function ConfiguracionPage() {
  const accounts = useAccounts({ includeArchived: true })
  const profile = useProfile()

  if (accounts.isLoading || profile.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Configuración</h1>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const allAccounts = accounts.data ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.data?.name ?? 'Usuario'} · {profile.data?.is_onboarded ? 'Onboarded' : 'Pendiente'}
        </p>
      </div>

      {ACCOUNT_GROUPS.map((group) => {
        const groupAccounts = allAccounts.filter(
          (a) => group.subtypes.includes(a.subtype as AccountSubtype) && (group.type === 'asset' ? a.type === 'asset' : a.type === 'liability'),
        )
        return (
          <AccountGroup
            key={group.title}
            title={group.title}
            description={group.description}
            accounts={groupAccounts}
            defaultType={group.type}
            defaultSubtype={group.defaultSubtype}
          />
        )
      })}

      <RecurringChargesSection accounts={allAccounts} />

      <ApiKeysSection />

      <ExportSection />
    </div>
  )
}

function AccountGroup({
  title,
  description,
  accounts,
  defaultType,
  defaultSubtype,
}: {
  title: string
  description: string
  accounts: Account[]
  defaultType: 'asset' | 'liability'
  defaultSubtype: AccountSubtype
}) {
  const [adding, setAdding] = useState(false)

  const active = accounts.filter((a) => !a.is_archived)
  const archived = accounts.filter((a) => a.is_archived)

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          + Agregar
        </Button>
      </div>

      <div className="divide-y divide-border">
        {adding && (
          <AddAccountRow
            defaultType={defaultType}
            defaultSubtype={defaultSubtype}
            onCancel={() => setAdding(false)}
            onSuccess={() => setAdding(false)}
          />
        )}

        {active.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-muted-foreground">Sin cuentas</p>
        )}

        {active.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}

        {archived.length > 0 && (
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">Archivadas ({archived.length})</p>
            {archived.map((a) => (
              <p key={a.id} className="mt-1 text-xs text-muted-foreground line-through">
                {a.name} · {formatMoney(a.balance ?? 0)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountRow({ account }: { account: Account }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(account.name)

  const renameMut = useMutation({
    mutationFn: () => renameAccount(supabase, account.id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setEditing(false)
      toast.success('Cuenta renombrada')
    },
    onError: (e) => toast.error(e.message),
  })

  const archiveMut = useMutation({
    mutationFn: () => archiveAccount(supabase, account.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Cuenta archivada')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            renameMut.mutate()
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
            autoFocus
          />
          <Button size="sm" type="submit" disabled={renameMut.isPending}>
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(account.name) }}>
            Cancelar
          </Button>
        </form>
      ) : (
        <>
          <div className="flex-1">
            <span className="text-sm">{account.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {SUBTYPE_LABELS[account.subtype ?? ''] ?? account.subtype}
            </span>
          </div>
          <span className="font-mono text-sm">{formatMoney(account.balance ?? 0)}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(`¿Archivar "${account.name}"?`)) archiveMut.mutate()
            }}
            disabled={archiveMut.isPending}
          >
            Archivar
          </Button>
        </>
      )}
    </div>
  )
}

function AddAccountRow({
  defaultType,
  defaultSubtype,
  onCancel,
  onSuccess,
}: {
  defaultType: 'asset' | 'liability'
  defaultSubtype: AccountSubtype
  onCancel: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('')

  const createMut = useMutation({
    mutationFn: () =>
      createAccount(supabase, {
        name,
        type: defaultType,
        subtype: defaultSubtype,
        balance: balance ? parseInt(balance, 10) : 0,
        onBudget: defaultSubtype !== 'investment' && defaultSubtype !== 'property',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(`Cuenta "${name}" creada`)
      onSuccess()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <form
      className="flex items-center gap-2 bg-muted/30 px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        createMut.mutate()
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la cuenta"
        className="flex-1 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
        autoFocus
      />
      <input
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        placeholder="Saldo inicial"
        type="number"
        className="w-32 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none"
      />
      <Button size="sm" type="submit" disabled={createMut.isPending || !name.trim()}>
        Crear
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  )
}

function RecurringChargesSection({ accounts }: { accounts: Account[] }) {
  const charges = useRecurringCharges()
  const createMut = useCreateRecurring()
  const deleteMut = useDeleteRecurring()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [category, setCategory] = useState('necesidad.suscripciones')
  const [accountId, setAccountId] = useState('')

  const activeAccounts = accounts.filter((a) => !a.is_archived)

  function handleAdd() {
    if (!name || !amount || !accountId) return
    createMut.mutate(
      { name, amount: parseInt(amount, 10), day_of_month: parseInt(day, 10), category, account_id: accountId },
      {
        onSuccess: () => {
          setAdding(false)
          setName('')
          setAmount('')
          setDay('1')
          toast.success(`"${name}" agregado`)
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  const total = (charges.data ?? []).filter((c) => c.is_active).reduce((s, c) => s + c.amount, 0)

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="font-semibold">Cargos Recurrentes</h2>
          <p className="text-xs text-muted-foreground">
            Total mensual: {formatMoney(total)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton />
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            + Agregar
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {adding && (
          <form
            className="flex flex-wrap items-center gap-2 bg-muted/30 px-5 py-3"
            onSubmit={(e) => { e.preventDefault(); handleAdd() }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-32 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none" autoFocus />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Monto" className="w-24 rounded-sm border border-input bg-background px-2 py-1 font-mono text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none" />
            <select value={day} onChange={(e) => setDay(e.target.value)} className="w-20 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none">
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>Día {i + 1}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none">
              <option value="necesidad.suscripciones">Suscripciones</option>
              <option value="necesidad.servicios">Servicios</option>
              <option value="necesidad.seguros">Seguros</option>
            </select>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-36 rounded-sm border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:ring-1 focus:ring-ring/20 focus:outline-none">
              <option value="">Cuenta...</option>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <Button size="sm" type="submit" disabled={createMut.isPending || !name || !amount || !accountId}>Crear</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
          </form>
        )}

        {(charges.data ?? []).map((charge) => (
          <div key={charge.id} className="flex items-center justify-between px-5 py-3">
            <div className="flex-1">
              <span className="text-sm">{charge.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">día {charge.day_of_month}</span>
            </div>
            <span className="font-mono text-sm">{formatMoney(charge.amount)}</span>
            <span className="ml-3 text-xs text-muted-foreground">{charge.category.split('.').pop()}</span>
            <button
              type="button"
              onClick={() => { if (confirm(`¿Eliminar "${charge.name}"?`)) deleteMut.mutate(charge.id) }}
              className="ml-3 text-xs text-muted-foreground hover:text-destructive"
            >
              ✕
            </button>
          </div>
        ))}

        {(charges.data ?? []).length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-muted-foreground">Sin cargos recurrentes</p>
        )}
      </div>
    </div>
  )
}
