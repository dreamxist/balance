# Balance App — Arquitectura

---

## Decision: Vite sobre Next.js

Para esta app, **Vite + React** es mejor que Next.js:

| Factor | Next.js | Vite + React |
|--------|---------|--------------|
| SSR/SEO | Si, pero no lo necesitas (app personal, detras de auth) |  No SSR = menos complejidad |
| Server Components | Fetch en servidor, pero Supabase client-side es igual de rapido | TanStack Query con cache = igual de rapido despues del primer load |
| Server Actions | Lindo, pero el CLI ya cubre mutaciones | supabase-js directo desde el client |
| DX (dev speed) | HMR lento en proyectos medianos | HMR instantaneo (<50ms) |
| Deploy | Necesita servidor (Vercel functions) | **Static SPA** — Vercel, Cloudflare Pages, S3, gratis |
| Bundle | ~85KB base (React + Next runtime) | ~45KB base (React + Router) |
| Complejidad | App Router, RSC, Server/Client boundary, caching layers | Un mental model: todo es client |
| Routing | File-based (magico) | TanStack Router (type-safe, explicito) |

**El argumento definitivo**: La web es un dashboard de consulta. El CLI es donde pasa la accion. No necesitas un servidor web — necesitas un SPA rapido que lea de Supabase.

---

## Estructura del proyecto

Monorepo con workspaces de bun:

```
balance/
├── packages/
│   └── core/                    ← Logica compartida
│       ├── src/
│       │   ├── supabase.ts      ← Client Supabase (singleton)
│       │   ├── types.ts         ← Generated types (supabase gen types)
│       │   ├── accounts.ts      ← CRUD cuentas
│       │   ├── transactions.ts  ← CRUD transacciones
│       │   ├── reconciliation.ts ← Logica de cuadre/delta
│       │   ├── debts.ts         ← Logica de deudas en cuotas
│       │   ├── snapshots.ts     ← Guardar/leer snapshots
│       │   └── categories.ts    ← Categorias
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── web/                     ← Vite + React SPA
│   │   ├── src/
│   │   │   ├── routes/          ← TanStack Router
│   │   │   │   ├── __root.tsx   ← Layout principal (tabs, cmd+k)
│   │   │   │   ├── index.tsx    ← Redirect a /cuadrar
│   │   │   │   ├── cuadrar.tsx  ← Pantalla principal
│   │   │   │   ├── movimientos.tsx
│   │   │   │   ├── spa.tsx
│   │   │   │   └── patrimonio.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/          ← Primitivos (Card, Button, Input)
│   │   │   │   ├── balance/     ← Baldes (Tengo, Debo, MeDeben)
│   │   │   │   ├── transactions/ ← Lista, formulario, filtros
│   │   │   │   ├── charts/      ← Graficos patrimonio
│   │   │   │   └── command-palette.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-accounts.ts
│   │   │   │   ├── use-transactions.ts
│   │   │   │   └── use-reconciliation.ts
│   │   │   ├── lib/
│   │   │   │   └── format.ts    ← Formateo CLP, fechas
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── cli/                     ← CLI tool (`bal`)
│       ├── src/
│       │   ├── index.ts         ← Entry point
│       │   ├── commands/
│       │   │   ├── accounts.ts  ← bal accounts [list|add|update]
│       │   │   ├── add.ts       ← bal add <monto> --cat --acc
│       │   │   ├── check.ts     ← bal check (delta/reconciliacion)
│       │   │   ├── snapshot.ts  ← bal snapshot [save|list|detail]
│       │   │   ├── summary.ts   ← bal summary --month YYYY-MM
│       │   │   ├── debts.ts     ← bal debts [list|add|pay]
│       │   │   └── import.ts    ← bal import (desde Excel)
│       │   └── output.ts        ← Formateo tabla/JSON para stdout
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/
│   ├── migrations/              ← SQL migrations
│   │   ├── 001_schema.sql
│   │   ├── 002_functions.sql
│   │   ├── 003_rls.sql
│   │   └── 004_seed.sql
│   └── config.toml
│
├── data/                        ← Data existente (Excel, CSV, JSON)
├── docs/                        ← Documentacion
├── package.json                 ← Monorepo root (bun workspaces)
└── turbo.json                   ← Turborepo (build/dev/test)
```

---

## Package: core

La logica de negocio vive aca. CLI y Web importan las mismas funciones.

### Supabase client

```typescript
// packages/core/src/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export function createSupabaseClient(options?: { accessToken?: string }) {
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    options?.accessToken
      ? { global: { headers: { Authorization: `Bearer ${options.accessToken}` } } }
      : undefined
  )
  return client
}
// CLI pasa el access token del usuario (de bal login o API key)
// Web usa supabase-js con sesion persistente (onAuthStateChange)
// service_role solo en Edge Functions y admin scripts
```

### Funciones de negocio (ejemplos)

```typescript
// packages/core/src/reconciliation.ts
export async function getReconciliationStatus(supabase: SupabaseClient) {
  const { data } = await supabase.rpc('get_reconciliation_status')
  return data  // { position, accumulated, delta, is_balanced }
}

export async function saveSnapshot(supabase: SupabaseClient) {
  const { data } = await supabase.rpc('create_snapshot')
  return data
}

// packages/core/src/transactions.ts
export async function createTransaction(supabase: SupabaseClient, input: {
  amount: number
  category: string
  accountId: string
  description: string
  entity: 'personal' | 'spa'
  installments?: number  // si es compra en cuotas
}) {
  if (input.installments && input.installments > 1) {
    // Compra en cuotas: llama a la DB function que maneja todo
    const { data } = await supabase.rpc('create_installment_purchase', {
      p_amount: input.amount,
      p_installments: input.installments,
      p_category: input.category,
      p_account_id: input.accountId,
      p_description: input.description,
    })
    return data
  }

  const { data } = await supabase.rpc('create_transaction', {
    p_amount: input.amount,
    p_category: input.category,
    p_account_id: input.accountId,
    p_description: input.description,
  })
  return data
}
```

---

## Convencion de signos

Los montos en la DB representan el flujo REAL del dinero:

```
Ingresos:       positivo   (+2285000 = recibes $2.285.000)
Gastos:         negativo   (-180000 = gastaste $180.000)
Refunds:        positivo   (+15000 = te devolvieron $15.000, reduce gasto neto)

Cuentas debito: positivo   (balance = lo que tienes)
Cuentas TC:     negativo   (balance = lo que debes)
Cuentas cash:   positivo   (balance = lo que tienes en mano)

Transferencias: negativo en origen, positivo en destino (suma cero)
Debt payments:  no afectan patrimonio, solo mueven deuda de "futuro" a "estado de cuenta"
```

Esta convencion significa que `sum(account.balance)` ya da el patrimonio neto correcto
sin necesidad de invertir signos de liabilities — los balances de TC ya son negativos.

---

## Montos en pesos (CLP) y centavos (USD)

CLP no tiene centavos. Los montos en cuentas CLP se almacenan como `bigint` en pesos enteros:

```
500,000 CLP → 500000 en DB
$180,000 CLP   → 180000 en DB

Formateo en UI/CLI:
  amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })
```

Para cuentas en USD, los montos se almacenan en centavos (estandar de Stripe, YNAB, etc):

```
$100.50 USD → 10050 en DB
```

El campo `currency` de la cuenta determina la interpretacion. La conversion para display
se hace en la capa de presentacion (core/format.ts), nunca en la DB.

---

## Database schema (PostgreSQL)

### Tablas

```sql
-- Entidades financieras
create type entity_type as enum ('personal', 'spa');

-- Tipos de cuenta
create type account_type as enum ('asset', 'liability');
create type account_subtype as enum (
  'debit',          -- cuenta debito (Checking A, Checking A, Bank B)
  'cash',           -- efectivo
  'credit_card',    -- tarjeta de credito
  'receivable',     -- me deben
  'payable',        -- debo (terceros, no TC)
  'investment',     -- Fintual, etc
  'property'        -- propiedades
);

-- ============================================================
-- ACCOUNTS: las "cajas" donde vive el dinero
-- ============================================================
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  type account_type not null,
  subtype account_subtype not null,
  entity entity_type not null default 'personal',
  currency text not null default 'CLP',
  balance bigint not null default 0,          -- saldo actual (pesos CLP o centavos USD)
  credit_limit bigint,                         -- solo para credit_card
  on_budget boolean not null default true,     -- false = inversiones, propiedades (excluidas de reconciliacion)
  metadata jsonb default '{}',                 -- datos extra flexibles
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_user_account_name unique (user_id, name)
);

-- ============================================================
-- TRANSACTIONS: movimientos financieros
-- ============================================================
create type transaction_type as enum (
  'income',          -- ingreso
  'expense',         -- gasto
  'refund',          -- devolucion (positivo, reduce gasto neto de la categoria original)
  'transfer',        -- entre cuentas propias / pago TC
  'debt_payment',    -- pago de cuota (no es gasto, no afecta acumulado)
  'adjustment'       -- ajuste de reconciliacion
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  account_id uuid references accounts(id) not null,
  type transaction_type not null,
  amount bigint not null,                      -- positivo = entrada, negativo = salida
  description text not null,
  category text,                               -- 'necesidad.bencina', 'consumo.ropa'
  entity entity_type not null default 'personal',
  date date not null default current_date,
  debt_id uuid references debts(id),           -- si es pago de cuota
  transfer_to uuid references accounts(id),    -- si es transferencia (cuenta destino)
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================
-- DEBTS: compras en cuotas y deudas
-- ============================================================
create type debt_status as enum ('active', 'paid', 'archived');

create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  account_id uuid references accounts(id) not null,  -- TC o cuenta asociada
  description text not null,                          -- "Sneakers Demo"
  total_amount bigint not null,                       -- monto total de la compra
  installments int not null,                          -- cantidad de cuotas
  installment_amount bigint not null,                 -- monto de cada cuota (truncado)
  last_installment_amount bigint not null,            -- ultima cuota absorbe el residuo
  installments_paid int not null default 0,
  remaining_amount bigint not null,                   -- lo que falta por pagar
  category text,                                      -- categoria del gasto original
  status debt_status not null default 'active',
  start_date date not null default current_date,
  first_payment_date date,                            -- si es futuro, la primera cuota no se paga aun (periodo de gracia)
  next_payment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SNAPSHOTS: fotos inmutables de un cierre
-- ============================================================
create type snapshot_status as enum ('balanced', 'unbalanced');

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  date date not null,
  total_assets bigint not null,
  total_liabilities bigint not null,
  net_worth bigint not null,
  accumulated bigint not null,                 -- sum de transacciones desde inicio
  delta bigint not null,                       -- net_worth - accumulated
  status snapshot_status not null,
  entries jsonb not null,                      -- snapshot de cada cuenta: [{account_id, balance}]
  created_at timestamptz not null default now()
);

-- ============================================================
-- CATEGORIES: arbol de categorias
-- ============================================================
create table categories (
  id text primary key,                         -- 'necesidad.bencina'
  name text not null,                          -- 'Bencina y TAG'
  parent_id text references categories(id),    -- 'necesidad'
  entity entity_type not null default 'personal',
  sort_order int not null default 0
);

-- ============================================================
-- INVOICES: facturas SpA
-- ============================================================
create type invoice_status as enum ('draft', 'sent', 'paid', 'partially_paid', 'overdue');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  client_name text not null,
  net_amount bigint not null,
  tax_amount bigint not null,                  -- IVA 19%
  total_amount bigint not null,
  amount_paid bigint not null default 0,       -- soporte de pagos parciales
  status invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  paid_date date,
  created_at timestamptz not null default now()
);
```

```sql
-- ============================================================
-- PROFILES: datos del usuario + feature flags
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id),
  name text,
  phone text,
  is_onboarded boolean not null default false,
  features jsonb not null default '{}',    -- {"spa": true, "investments": true, ...}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS
alter table profiles enable row level security;

create policy "profiles_select" on profiles
  for select using ((select auth.uid()) = id);

create policy "profiles_update" on profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
```

```sql
-- ============================================================
-- Onboarding: setup inicial rapido
-- ============================================================
create function complete_onboarding(
  p_accounts jsonb,    -- [{"name": "Mi dinero", "type": "asset", "subtype": "debit", "balance": 3000000}]
  p_name text default null,
  p_phone text default null,
  p_features jsonb default '{}'
) returns jsonb as $$
declare
  v_account_record jsonb;
  v_account accounts;
  v_created_accounts jsonb := '[]';
begin
  -- Create accounts and opening balances
  for v_account_record in select * from jsonb_array_elements(p_accounts)
  loop
    insert into accounts (user_id, name, type, subtype, balance, entity, on_budget)
    values (
      (select auth.uid()),
      v_account_record->>'name',
      (v_account_record->>'type')::account_type,
      (v_account_record->>'subtype')::account_subtype,
      (v_account_record->>'balance')::bigint,
      coalesce((v_account_record->>'entity')::entity_type, 'personal'),
      coalesce((v_account_record->>'on_budget')::boolean, true)
    ) returning * into v_account;

    -- Opening balance (register in accumulated without moving balance)
    perform _insert_transaction(
      v_account.user_id, v_account.id, 'adjustment',
      v_account.balance, null, 'Apertura: ' || v_account.name,
      v_account.entity, current_date
    );

    v_created_accounts := v_created_accounts || to_jsonb(v_account);
  end loop;

  -- Update profile
  update profiles set
    name = coalesce(p_name, name),
    phone = coalesce(p_phone, phone),
    features = p_features,
    is_onboarded = true,
    updated_at = now()
  where id = (select auth.uid());

  return jsonb_build_object(
    'accounts', v_created_accounts,
    'is_onboarded', true
  );
end;
$$ language plpgsql;
```

**Nota:** La tabla `balance_entries` fue eliminada. El campo `accounts.balance` + `audit_log`
cubren la misma necesidad (historial de saldos declarados se puede reconstruir del audit log).

### Indices

```sql
-- profiles doesn't need a user_id index since id IS the user_id (PK)
```

```sql
create index idx_accounts_user on accounts(user_id);
create index idx_transactions_user_date on transactions(user_id, date desc);
create index idx_transactions_date on transactions(date desc);
create index idx_transactions_account on transactions(account_id);
create index idx_transactions_category on transactions(category);
create index idx_transactions_entity on transactions(entity);
create index idx_debts_status on debts(status) where status = 'active';
create index idx_snapshots_date on snapshots(date desc);
```

### Views

```sql
-- Resumen mensual por categoria
-- security_invoker = true: la view ejecuta con los permisos del usuario que la consulta (no del owner)
create view monthly_summary with (security_invoker = true) as
select
  date_trunc('month', date) as month,
  entity,
  category,
  type,
  sum(case when type = 'income' then amount else 0 end) as income,
  sum(case when type in ('expense', 'refund') then amount else 0 end) as expenses,
  sum(case when type in ('income', 'expense', 'refund') then amount else 0 end) as net,
  count(*) as tx_count
from transactions
where user_id = (select auth.uid())
  and type in ('income', 'expense', 'refund')
group by 1, 2, 3, 4;

-- Estado actual de reconciliacion (solo cuentas on_budget)
create view reconciliation_status with (security_invoker = true) as
select
  (select coalesce(sum(a.balance), 0)
   from accounts a
   where not a.is_archived
     and a.on_budget = true
     and a.user_id = (select auth.uid())) as position,

  (select coalesce(sum(amount), 0)
   from transactions
   where type in ('income', 'expense', 'refund', 'adjustment')
     and user_id = (select auth.uid())) as accumulated,

  (select coalesce(sum(a.balance), 0)
   from accounts a
   where not a.is_archived
     and a.on_budget = true
     and a.user_id = (select auth.uid()))
  -
  (select coalesce(sum(amount), 0)
   from transactions
   where type in ('income', 'expense', 'refund', 'adjustment')
     and user_id = (select auth.uid())) as delta;

-- Deudas activas con detalle
create view active_debts with (security_invoker = true) as
select
  d.*,
  a.name as account_name,
  d.installments - d.installments_paid as remaining_installments,
  d.next_payment_date
from debts d
join accounts a on a.id = d.account_id
where d.status = 'active'
  and d.user_id = (select auth.uid());

-- Cupo de tarjetas de credito
create view credit_card_status with (security_invoker = true) as
select
  a.id,
  a.name,
  a.balance as statement_balance,        -- estado de cuenta (negativo)
  coalesce(sum(d.remaining_amount), 0) as future_installments,
  a.balance + coalesce(sum(d.remaining_amount), 0) as total_used,
  a.credit_limit,
  a.credit_limit + a.balance + coalesce(sum(d.remaining_amount), 0) as available
from accounts a
left join debts d on d.account_id = a.id and d.status = 'active'
where a.subtype = 'credit_card'
  and a.user_id = (select auth.uid())
group by a.id;
```

### Reconciliacion: modelo conceptual

```
Para cuentas on_budget solamente:

  Position = sum(account.balance)
  // Los balances de activos son positivos, los de liabilities (TC) ya son negativos.
  // Entonces sum(balance) = activos - deudas, que es el patrimonio neto on-budget.

  Accumulated = sum(transaction.amount) para tipos: income, expense, refund, adjustment
  // Transfers y debt_payments NO cuentan (no cambian patrimonio).

  Delta = Position - Accumulated → deberia ser 0

Cuando compras en cuotas (Approach A):
  1. Se registra el MONTO TOTAL como expense → accumulated baja por el total
  2. El balance de la TC baja por el total (el banco lo hace) → position baja por el total
  3. Delta = 0 inmediatamente
  4. Cada mes, el pago de cuota es 'debt_payment' (no expense) → no afecta accumulated
  5. El debt_payment mueve dinero de la cuenta de pago a la TC, pero la posicion neta no cambia

Setup:
  1. User creates accounts with initial balances
  2. For each on_budget account, call create_opening_balance()
     This registers the balance in accumulated without moving it
  3. Delta = 0 from the start

Cuentas off-budget (inversiones, propiedades):
  - Se excluyen de la reconciliacion
  - Se incluyen en el calculo de net_worth total del snapshot
  - Sus transacciones tampoco cuentan para accumulated
```

### Database Functions (logica de negocio)

Arquitectura en capas: primitivas reutilizables + operaciones de negocio que las componen.

```sql
-- ============================================================
-- Capa 1: Primitivas (una sola responsabilidad)
-- ============================================================

create function _insert_transaction(
  p_user_id uuid, p_account_id uuid, p_type transaction_type,
  p_amount bigint, p_category text, p_description text,
  p_entity entity_type, p_date date,
  p_debt_id uuid default null, p_transfer_to uuid default null
) returns transactions as $$
  insert into transactions (user_id, account_id, type, amount, category, description, entity, date, debt_id, transfer_to)
  values (p_user_id, p_account_id, p_type, p_amount, p_category, p_description, p_entity, p_date, p_debt_id, p_transfer_to)
  returning *;
$$ language sql;

create function _update_account_balance(
  p_account_id uuid, p_delta bigint
) returns accounts as $$
  update accounts
  set balance = balance + p_delta, updated_at = now()
  where id = p_account_id
  returning *;
$$ language sql;

create function _create_debt(
  p_user_id uuid, p_account_id uuid, p_description text,
  p_total bigint, p_installments int, p_category text,
  p_start_date date, p_first_payment_date date default null
) returns debts as $$
declare
  v_installment bigint;
  v_last_installment bigint;
  v_first_pay date;
begin
  v_installment := p_total / p_installments;  -- truncated (integer division)
  v_last_installment := p_total - (v_installment * (p_installments - 1));
  v_first_pay := coalesce(p_first_payment_date, p_start_date + interval '1 month');

  return query
  insert into debts (
    user_id, account_id, description, total_amount,
    installments, installment_amount, last_installment_amount,
    installments_paid, remaining_amount, category,
    start_date, first_payment_date, next_payment_date
  ) values (
    p_user_id, p_account_id, p_description, p_total,
    p_installments, v_installment, v_last_installment,
    0, p_total, p_category,
    p_start_date, v_first_pay, v_first_pay
  ) returning *;
end;
$$ language plpgsql;

create function _advance_debt_payment(p_debt_id uuid)
returns debts as $$
declare
  v_debt debts;
  v_payment_amount bigint;
begin
  select * into strict v_debt from debts where id = p_debt_id;

  -- La ultima cuota absorbe el residuo de redondeo
  if v_debt.installments_paid + 1 = v_debt.installments then
    v_payment_amount := v_debt.last_installment_amount;
  else
    v_payment_amount := v_debt.installment_amount;
  end if;

  return query
  update debts set
    installments_paid = installments_paid + 1,
    remaining_amount = remaining_amount - v_payment_amount,
    next_payment_date = next_payment_date + interval '1 month',
    status = case
      when installments_paid + 1 >= installments then 'paid'
      else 'active'
    end,
    updated_at = now()
  where id = p_debt_id
  returning *;
end;
$$ language plpgsql;

-- ============================================================
-- Capa 2: Operaciones de negocio (componen primitivas)
-- ============================================================

-- Opening balance: registers an account's existing balance in accumulated
-- Does NOT move the account balance (it already has the correct balance from creation)
create function create_opening_balance(p_account_id uuid)
returns transactions as $$
declare
  v_account accounts;
begin
  select * into strict v_account from accounts where id = p_account_id;

  return query
  select * from _insert_transaction(
    v_account.user_id, p_account_id, 'adjustment',
    v_account.balance, null, 'Apertura: ' || v_account.name,
    v_account.entity, current_date
  );
  -- Note: does NOT call _update_account_balance
  -- The account already has the correct balance from creation
end;
$$ language plpgsql;

-- No cancel_debt function. Product returns with installments are handled as:
-- 1. createRefund() — store refunds to the TC
-- 2. Archive the debt manually (UPDATE debts SET status = 'archived', remaining_amount = 0)
-- 3. User updates TC balance when reconciling
-- This mirrors the real-world process: the bank adjusts the TC, the user confirms.

-- Pagar deuda completa (lump-sum payoff, con descuento opcional)
create function pay_off_debt(
  p_debt_id uuid,
  p_actual_amount bigint default null  -- if less than remaining, difference is discount
) returns jsonb as $$
declare
  v_debt debts;
  v_account accounts;
  v_remaining bigint;
  v_discount bigint;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'active';
  if not found then raise exception 'Debt not found or not active'; end if;
  
  select * into v_account from accounts where id = v_debt.account_id;
  v_remaining := abs(v_debt.remaining_amount);
  
  -- If actual amount paid is less than remaining, create discount adjustment
  if p_actual_amount is not null and p_actual_amount < v_remaining then
    v_discount := v_remaining - p_actual_amount;
    perform _insert_transaction(
      v_account.user_id, v_debt.account_id, 'adjustment',
      v_discount, v_debt.category,
      'Discount on payoff: ' || v_debt.description,
      v_account.entity, current_date, p_debt_id
    );
    perform _update_account_balance(v_debt.account_id, v_discount);
  end if;
  
  -- Register lump-sum payment as debt_payment
  perform _insert_transaction(
    v_account.user_id, v_debt.account_id, 'debt_payment',
    -(coalesce(p_actual_amount, v_remaining)), v_debt.category,
    'Payoff: ' || v_debt.description,
    v_account.entity, current_date, p_debt_id
  );
  
  -- Mark debt as paid
  update debts set
    installments_paid = installments,
    remaining_amount = 0,
    status = 'paid',
    updated_at = now()
  where id = p_debt_id;
  
  return jsonb_build_object('debt_id', p_debt_id, 'status', 'paid');
end;
$$ language plpgsql;

-- Crear transaccion simple (gasto/ingreso/refund)
create function create_transaction(
  p_amount bigint, p_category text,
  p_account_id uuid, p_description text,
  p_type transaction_type default null,
  p_date date default current_date
) returns jsonb as $$
declare
  v_account accounts;
  v_tx transactions;
begin
  select * into strict v_account from accounts where id = p_account_id;

  if p_type is null then
    p_type := case when p_amount >= 0 then 'income' else 'expense' end;
  end if;

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, p_type,
    p_amount, p_category, p_description,
    v_account.entity, p_date
  );

  perform _update_account_balance(p_account_id, p_amount);

  return to_jsonb(v_tx);
end;
$$ language plpgsql;

-- Compra en cuotas (Approach A)
-- Registra el TOTAL como expense al momento de la compra.
-- La cuota mensual es debt_payment (no afecta accumulated).
-- Esto hace que position y accumulated bajen por el total inmediatamente → delta = 0.
create function create_installment_purchase(
  p_amount bigint,           -- monto TOTAL (ej: -180000)
  p_installments int,        -- cantidad cuotas (ej: 6)
  p_category text,
  p_account_id uuid,
  p_description text,
  p_date date default current_date,
  p_first_payment_date date default null  -- periodo de gracia: si es futuro, no pagar primera cuota aun
) returns jsonb as $$
declare
  v_account accounts;
  v_debt debts;
  v_tx transactions;
begin
  select * into strict v_account from accounts where id = p_account_id;

  -- 1. Crear deuda (installments_paid = 0, remaining = total)
  v_debt := _create_debt(
    v_account.user_id, p_account_id, p_description,
    p_amount, p_installments, p_category, p_date, p_first_payment_date
  );

  -- 2. Registrar UNA transaccion de tipo 'expense' por el MONTO TOTAL
  --    Esto impacta el acumulado inmediatamente (ya "gastaste" todo el monto).
  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, 'expense',
    p_amount, p_category,
    p_description || ' (' || p_installments || ' cuotas)',
    v_account.entity, p_date, v_debt.id
  );

  -- 3. Balance de TC: baja por el monto total (el banco carga toda la deuda)
  perform _update_account_balance(p_account_id, p_amount);

  return jsonb_build_object(
    'debt', to_jsonb(v_debt),
    'transaction', to_jsonb(v_tx),
    'patrimony_impact', p_amount,
    'installment_amount', v_debt.installment_amount,
    'last_installment_amount', v_debt.last_installment_amount
  );

exception when others then
  insert into error_log (function_name, error_message, error_detail, context)
  values ('create_installment_purchase', SQLERRM, SQLSTATE,
    jsonb_build_object('amount', p_amount, 'account', p_account_id));
  raise;
end;
$$ language plpgsql;

-- Pagar cuota de deuda
-- Tipo 'debt_payment': NO afecta accumulated ni patrimonio.
-- Solo mueve dinero de la cuenta de pago → reduce remaining_amount en debts.
-- El balance de la TC no cambia aqui (ya fue cargado al comprar).
-- Si el pago viene de una cuenta debito (transferencia al TC), usar create_transfer por separado.
create function pay_debt_installment(
  p_debt_id uuid,
  p_date date default current_date
) returns jsonb as $$
declare
  v_debt debts;
  v_tx transactions;
  v_payment_amount bigint;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'active';
  if not found then
    raise exception 'Deuda no encontrada o ya pagada';
  end if;

  -- Calcular monto de esta cuota (ultima cuota absorbe residuo)
  if v_debt.installments_paid + 1 = v_debt.installments then
    v_payment_amount := v_debt.last_installment_amount;
  else
    v_payment_amount := v_debt.installment_amount;
  end if;

  -- Registrar como debt_payment (NO expense — no afecta accumulated)
  v_tx := _insert_transaction(
    v_debt.user_id, v_debt.account_id, 'debt_payment',
    v_payment_amount, v_debt.category,
    v_debt.description || ' (cuota ' || (v_debt.installments_paid + 1) || '/' || v_debt.installments || ')',
    (select entity from accounts where id = v_debt.account_id),
    p_date, p_debt_id
  );

  -- Avanzar la deuda
  v_debt := _advance_debt_payment(p_debt_id);

  return jsonb_build_object(
    'transaction', to_jsonb(v_tx),
    'remaining', v_debt.remaining_amount,
    'installments_left', v_debt.installments - v_debt.installments_paid
  );
end;
$$ language plpgsql;

-- Transferencia entre cuentas propias
-- Tipo 'transfer': NO afecta accumulated (mover dinero no cambia patrimonio).
-- Crea DOS transacciones atomicamente: debito en origen, credito en destino.
create function create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount bigint,           -- monto positivo a transferir
  p_description text,
  p_date date default current_date
) returns jsonb as $$
declare
  v_from accounts;
  v_to accounts;
  v_tx_from transactions;
  v_tx_to transactions;
begin
  select * into strict v_from from accounts where id = p_from_account_id;
  select * into strict v_to from accounts where id = p_to_account_id;

  if p_amount <= 0 then
    raise exception 'Transfer amount must be positive';
  end if;

  -- Debito en cuenta origen (negativo)
  v_tx_from := _insert_transaction(
    v_from.user_id, p_from_account_id, 'transfer',
    -p_amount, null, p_description || ' → ' || v_to.name,
    v_from.entity, p_date, null, p_to_account_id
  );

  -- Credito en cuenta destino (positivo)
  v_tx_to := _insert_transaction(
    v_to.user_id, p_to_account_id, 'transfer',
    p_amount, null, p_description || ' ← ' || v_from.name,
    v_to.entity, p_date, null, p_from_account_id
  );

  -- Actualizar balances
  perform _update_account_balance(p_from_account_id, -p_amount);
  perform _update_account_balance(p_to_account_id, p_amount);

  return jsonb_build_object(
    'from_transaction', to_jsonb(v_tx_from),
    'to_transaction', to_jsonb(v_tx_to),
    'amount', p_amount,
    'patrimony_impact', 0  -- transferencias no cambian patrimonio
  );
end;
$$ language plpgsql;

-- Transferencia inter-entidad (SpA ↔ Personal)
-- Misma mecanica que transfer pero entre entidades distintas.
-- Se registra como 'transfer' en ambas entidades.
create function create_inter_entity_transfer(
  p_from_account_id uuid,   -- cuenta de la entidad origen (ej: SpA Bank B)
  p_to_account_id uuid,     -- cuenta de la entidad destino (ej: Personal Checking A)
  p_amount bigint,           -- monto positivo
  p_description text,
  p_date date default current_date
) returns jsonb as $$
declare
  v_from accounts;
  v_to accounts;
  v_tx_from transactions;
  v_tx_to transactions;
begin
  select * into strict v_from from accounts where id = p_from_account_id;
  select * into strict v_to from accounts where id = p_to_account_id;

  if v_from.entity = v_to.entity then
    raise exception 'Use create_transfer for same-entity transfers';
  end if;

  if p_amount <= 0 then
    raise exception 'Transfer amount must be positive';
  end if;

  -- Debito en cuenta origen
  v_tx_from := _insert_transaction(
    v_from.user_id, p_from_account_id, 'transfer',
    -p_amount, null,
    p_description || ' → ' || v_to.name || ' [' || v_to.entity || ']',
    v_from.entity, p_date, null, p_to_account_id
  );

  -- Credito en cuenta destino
  v_tx_to := _insert_transaction(
    v_to.user_id, p_to_account_id, 'transfer',
    p_amount, null,
    p_description || ' ← ' || v_from.name || ' [' || v_from.entity || ']',
    v_to.entity, p_date, null, p_from_account_id
  );

  perform _update_account_balance(p_from_account_id, -p_amount);
  perform _update_account_balance(p_to_account_id, p_amount);

  return jsonb_build_object(
    'from_transaction', to_jsonb(v_tx_from),
    'to_transaction', to_jsonb(v_tx_to),
    'from_entity', v_from.entity,
    'to_entity', v_to.entity,
    'amount', p_amount,
    'patrimony_impact', 0
  );
end;
$$ language plpgsql;

-- Crear snapshot (cierre de periodo)
create function create_snapshot(
  p_date date default current_date
) returns jsonb as $$
declare
  v_snapshot snapshots;
  v_entries jsonb;
  v_assets bigint;
  v_liabilities bigint;
  v_accumulated bigint;
begin
  -- Advisory lock para evitar snapshots concurrentes
  if not pg_try_advisory_xact_lock(hashtext('snapshot_' || (select auth.uid())::text)) then
    raise exception 'Another snapshot operation is in progress. Try again.'
      using errcode = 'P0003';
  end if;

  if exists (select 1 from snapshots where date = p_date and user_id = (select auth.uid())) then
    raise exception 'Snapshot for date % already exists', p_date
      using errcode = 'P0004';
  end if;

  -- Capturar estado de cada cuenta
  select jsonb_agg(jsonb_build_object(
    'account_id', id, 'name', name, 'type', type,
    'subtype', subtype, 'balance', balance, 'on_budget', on_budget
  )) into v_entries
  from accounts
  where not is_archived
    and user_id = (select auth.uid());

  -- Calcular totales (todos las cuentas para net_worth)
  select
    coalesce(sum(case when type = 'asset' then balance else 0 end), 0),
    coalesce(sum(case when type = 'liability' then abs(balance) else 0 end), 0)
  into v_assets, v_liabilities
  from accounts
  where not is_archived
    and user_id = (select auth.uid());

  -- Acumulado de transacciones (refund incluido)
  select coalesce(sum(amount), 0) into v_accumulated
  from transactions
  where type in ('income', 'expense', 'refund', 'adjustment')
    and user_id = (select auth.uid());

  insert into snapshots (
    user_id, date, total_assets, total_liabilities,
    net_worth, accumulated, delta, status, entries
  ) values (
    (select auth.uid()), p_date, v_assets, v_liabilities,
    v_assets - v_liabilities, v_accumulated,
    (v_assets - v_liabilities) - v_accumulated,
    case when (v_assets - v_liabilities) = v_accumulated then 'balanced' else 'unbalanced' end,
    v_entries
  ) returning * into v_snapshot;

  return to_jsonb(v_snapshot);
end;
$$ language plpgsql;

-- Estado de reconciliacion actual (solo on_budget)
create function get_reconciliation_status()
returns jsonb as $$
declare
  v_position bigint;
  v_accumulated bigint;
begin
  -- Position = sum de balances de cuentas on_budget
  -- (activos positivos, liabilities ya negativos → sum da patrimonio neto)
  select coalesce(sum(balance), 0) into v_position
  from accounts
  where not is_archived
    and on_budget = true
    and user_id = (select auth.uid());

  -- Accumulated = sum de income + expense + refund + adjustment
  select coalesce(sum(amount), 0) into v_accumulated
  from transactions
  where type in ('income', 'expense', 'refund', 'adjustment')
    and user_id = (select auth.uid());

  return jsonb_build_object(
    'position', v_position,
    'accumulated', v_accumulated,
    'delta', v_position - v_accumulated,
    'is_balanced', v_position = v_accumulated
  );
end;
$$ language plpgsql;

-- Capa 3: Consultas (solo lectura, no mutan estado)
-- ==================================================
-- get_reconciliation_status()   → definida arriba
-- monthly_summary view          → definida arriba
-- credit_card_status view       → definida arriba
-- active_debts view             → definida arriba
-- reconciliation_status view    → definida arriba
```

---

## Authentication & Authorization

Tres metodos de autenticacion, todos convergen en el mismo modelo de seguridad: JWT de usuario + RLS.

### A. Web App — OAuth / Email login con JWT refresh

```
- Supabase Auth maneja todo
- Email/password signup + login
- JWT almacenado en httpOnly cookie o localStorage
- Refresh token auto-renewal via supabase-js onAuthStateChange
- Todas las queries de Supabase usan el JWT del usuario → RLS enforced
- La sesion persiste entre recargas del browser
```

### B. CLI — Login interactivo + credenciales almacenadas

```
- `bal login` → supabase.auth.signInWithPassword(email, password)
- Almacena refresh token + access token en ~/.balance/credentials.json
- En cada invocacion del CLI:
  1. Leer archivo de credenciales
  2. Verificar si el access token expiro
  3. Si expiro, usar refresh token para obtener nuevo access token
  4. Si el refresh token tambien expiro → pedir re-login
- Todas las queries usan el JWT del usuario → RLS enforced (NO service_role)
- `bal logout` → borra archivo de credenciales
```

### C. API Keys — Para agentes/bots

```
- El usuario genera una API key desde la web (Settings > API Keys)
- Formato: bal_sk_[32 random chars] (prefijo para identificacion facil)
- La key se muestra UNA VEZ al crearla, despues solo se almacena el hash
- Uso en CLI/agent: BALANCE_API_KEY=bal_sk_... bal summary
- O: bal --api-key bal_sk_... summary

Flujo de resolucion en Edge Function:
  1. Recibe API key en header Authorization
  2. La hashea, busca en tabla api_keys
  3. Obtiene el user_id asociado a la key
  4. Genera un JWT de corta duracion para ese user_id
  5. Usa ese JWT para la query real a Supabase (RLS enforced)

Esto significa que las API keys tienen la MISMA seguridad que el login normal — RLS aplica.
```

### Tabla y funciones de API Keys

```sql
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,                    -- "openclaw", "CLI laptop", "automation"
  key_prefix text not null,              -- primeros 8 chars para identificacion (bal_sk_a)
  key_hash text not null,                -- bcrypt hash de la key completa
  scopes text[] default '{}',            -- futuro: limitar que puede hacer la key
  last_used_at timestamptz,
  expires_at timestamptz,                -- null = nunca expira
  is_revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS: usuarios solo ven/gestionan sus propias keys
alter table api_keys enable row level security;

create policy "api_keys_select" on api_keys
  for select using ((select auth.uid()) = user_id);

create policy "api_keys_insert" on api_keys
  for insert with check ((select auth.uid()) = user_id);

create policy "api_keys_update" on api_keys
  for update using ((select auth.uid()) = user_id);

-- No delete — revocar en vez de borrar (is_revoked = true)

-- Funcion para crear API key (retorna la key raw UNA VEZ)
create function create_api_key(p_name text)
returns jsonb as $$
declare
  v_raw_key text;
  v_prefix text;
  v_hash text;
  v_record api_keys;
begin
  -- Generar key random: bal_sk_ + 32 random chars
  v_raw_key := 'bal_sk_' || encode(gen_random_bytes(24), 'base64');
  v_raw_key := replace(replace(replace(v_raw_key, '+', ''), '/', ''), '=', '');
  v_prefix := substring(v_raw_key from 1 for 15);
  v_hash := crypt(v_raw_key, gen_salt('bf'));

  insert into api_keys (user_id, name, key_prefix, key_hash)
  values ((select auth.uid()), p_name, v_prefix, v_hash)
  returning * into v_record;

  -- Retorna la key raw (unica vez que es visible)
  return jsonb_build_object(
    'id', v_record.id,
    'name', v_record.name,
    'key', v_raw_key,
    'prefix', v_prefix,
    'created_at', v_record.created_at
  );
end;
$$ language plpgsql security definer;

-- Funcion para validar API key (usada por Edge Function)
create function validate_api_key(p_key text)
returns uuid as $$
declare
  v_record api_keys;
begin
  -- Buscar por prefijo primero (lookup rapido), luego verificar hash
  select * into v_record
  from api_keys
  where key_prefix = substring(p_key from 1 for 15)
    and not is_revoked
    and (expires_at is null or expires_at > now());

  if not found then return null; end if;

  -- Verificar hash
  if v_record.key_hash = crypt(p_key, v_record.key_hash) then
    -- Actualizar last_used_at
    update api_keys set last_used_at = now() where id = v_record.id;
    return v_record.user_id;
  end if;

  return null;
end;
$$ language plpgsql security definer;

-- Funcion para revocar API key
create function revoke_api_key(p_key_id uuid)
returns void as $$
begin
  update api_keys
  set is_revoked = true
  where id = p_key_id and user_id = (select auth.uid());
end;
$$ language plpgsql;
```

### Edge Function para auth con API key

```typescript
// supabase/functions/auth-api-key/index.ts
// Valida API key y retorna un JWT de corta duracion

import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!apiKey?.startsWith('bal_sk_')) {
    return new Response(JSON.stringify({ error: 'Invalid API key format' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: userId } = await supabase.rpc('validate_api_key', { p_key: apiKey })

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Invalid or expired API key' }), { status: 401 })
  }

  // Generar JWT para este usuario (corta duracion, 1 hora)
  // El CLI/agent usa este JWT para requests subsiguientes
  // Esto asegura que RLS aplica a todas las queries
  return new Response(JSON.stringify({
    user_id: userId,
    // En practica, usar supabase.auth.admin.generateLink o JWT custom
    message: 'Use supabase.auth.admin to generate session for this user_id'
  }))
})
```

### Orden de resolucion de auth en CLI

```
Invocacion del CLI:
  1. Verificar env var BALANCE_API_KEY → si existe, usar auth por API key
  2. Verificar ~/.balance/credentials.json → si existe, usar JWT almacenado
  3. Ninguno → mostrar "Run `bal login` or set BALANCE_API_KEY"

Formato de ~/.balance/credentials.json:
{
  "access_token": "eyJ...",
  "refresh_token": "abc123...",
  "expires_at": 1234567890,
  "user_id": "uuid",
  "email": "user@example.com"
}
```

---

## Resiliencia, seguridad y concurrencia

### 1. Transacciones atomicas (ACID)

Cada operacion financiera que toca multiples tablas DEBE ser atomica.
Si falla cualquier paso, se revierte todo.

```sql
-- TODAS las database functions ya son atomicas por defecto en PostgreSQL:
-- si cualquier statement falla, se hace rollback automatico de toda la funcion.

-- Las funciones de Capa 2 componen primitivas de Capa 1 dentro de una sola
-- transaccion PL/pgSQL. Si _update_account_balance falla despues de
-- _insert_transaction, TODO se revierte.

-- Exception handler con logging:
-- Las funciones criticas (create_installment_purchase, etc) capturan errores,
-- los registran en error_log, y re-lanzan. PostgreSQL hace rollback automatico.
```

### 2. Control de concurrencia (CLI + Web al mismo tiempo)

Escenario: la web y el CLI intentan modificar la misma cuenta simultaneamente.

**Estrategia: Optimistic Concurrency Control (OCC) con version column**

```sql
-- Agregar version a tablas que se modifican concurrentemente
alter table accounts add column version int not null default 1;

-- Update con check de version
create function update_account_balance(
  p_account_id uuid,
  p_new_balance bigint,
  p_expected_version int  -- el cliente envia la version que leyo
) returns jsonb as $$
declare
  v_account accounts;
begin
  update accounts
  set balance = p_new_balance,
      version = version + 1,
      updated_at = now()
  where id = p_account_id
    and version = p_expected_version  -- solo si nadie mas la toco
  returning * into v_account;

  if not found then
    -- Otro cliente modifico la cuenta entre el read y el update
    raise exception 'CONFLICT: account % was modified by another client. Read again and retry.',
      p_account_id
      using errcode = 'P0002';  -- custom error code
  end if;

  return to_jsonb(v_account);
end;
$$ language plpgsql;
```

**Para operaciones que suman/restan (no reemplazan), usar UPDATE atomico:**

```sql
-- Esto es safe contra concurrencia SIN necesitar version check
-- porque PostgreSQL serializa los updates a la misma fila
update accounts
set balance = balance + p_amount,  -- atomico, no hay read-then-write
    updated_at = now()
where id = p_account_id;
```

**Advisory locks para operaciones de snapshot (solo una a la vez):**

```sql
-- Ya implementado dentro de create_snapshot():
-- pg_try_advisory_xact_lock() previene snapshots concurrentes
-- Tambien valida que no exista snapshot para la fecha
```

### 3. Rollback y undo de operaciones

**Principio: nunca borrar, siempre compensar.**

```sql
-- Tabla de audit log (inmutable, append-only)
create table audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) not null,
  table_name text not null,
  record_id uuid not null,
  action text not null,          -- 'insert', 'update', 'delete', 'undo'
  old_data jsonb,                -- estado anterior (null en insert)
  new_data jsonb,                -- estado nuevo (null en delete)
  metadata jsonb default '{}',   -- contexto extra (source: 'cli'|'web', etc)
  created_at timestamptz not null default now()
);

-- RLS: solo lectura para el usuario, inserts via trigger
alter table audit_log enable row level security;
create policy "read_own" on audit_log for select using ((select auth.uid()) = user_id);
-- No update/delete policy = inmutable

-- Trigger automatico para audit
create function audit_trigger() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into audit_log (user_id, table_name, record_id, action, new_data)
    values (coalesce(NEW.user_id, (select auth.uid())), TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values (coalesce(NEW.user_id, (select auth.uid())), TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into audit_log (user_id, table_name, record_id, action, old_data)
    values (coalesce(OLD.user_id, (select auth.uid())), TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD));
    return OLD;
  end if;
end;
$$ language plpgsql security definer;  -- ejecuta como owner, bypass RLS

-- Aplicar a todas las tablas financieras
create trigger audit_accounts after insert or update or delete on accounts
  for each row execute function audit_trigger();
create trigger audit_transactions after insert or update or delete on transactions
  for each row execute function audit_trigger();
create trigger audit_debts after insert or update or delete on debts
  for each row execute function audit_trigger();
create trigger audit_snapshots after insert or update or delete on snapshots
  for each row execute function audit_trigger();
create trigger audit_invoices after insert or update or delete on invoices
  for each row execute function audit_trigger();
```

**Funcion de undo (revertir una transaccion):**

```sql
create function undo_transaction(p_transaction_id uuid)
returns jsonb as $$
declare
  v_original transactions;
  v_reversal transactions;
begin
  select * into v_original from transactions where id = p_transaction_id;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0005';
  end if;

  -- Crear transaccion inversa (no borrar la original)
  insert into transactions (
    user_id, account_id, type, amount, category,
    description, entity, date, metadata
  ) values (
    v_original.user_id, v_original.account_id,
    'adjustment',
    -v_original.amount,  -- monto inverso
    v_original.category,
    'UNDO: ' || v_original.description,
    v_original.entity,
    current_date,
    jsonb_build_object('undoes', p_transaction_id)
  ) returning * into v_reversal;

  -- Revertir el efecto en la cuenta
  update accounts
  set balance = balance - v_original.amount,
      updated_at = now()
  where id = v_original.account_id;

  -- Si era pago de deuda, revertir la deuda
  if v_original.debt_id is not null then
    update debts set
      installments_paid = installments_paid - 1,
      remaining_amount = remaining_amount + v_original.amount,
      status = 'active',
      updated_at = now()
    where id = v_original.debt_id;
  end if;

  return jsonb_build_object(
    'original', to_jsonb(v_original),
    'reversal', to_jsonb(v_reversal)
  );
end;
$$ language plpgsql;
```

### 4. RLS — Row Level Security en profundidad

**Principio: DENY by default. Cada tabla tiene RLS habilitado.
Si no hay policy, no hay acceso.**

**Performance: usar `(select auth.uid())` en vez de `auth.uid()` directo.**
El subselect se evalua una vez y se cachea, en vez de llamar la funcion por cada fila.

```sql
-- ============================================================
-- ROLES EN SUPABASE
-- ============================================================
--
-- anon:          Usuario no autenticado. NO deberia ver nada financiero.
-- authenticated: Usuario logueado. Ve SOLO sus propios datos.
-- service_role:  Bypass total de RLS. Solo para Edge Functions y operaciones admin.
--
-- CLI usa JWT de usuario (de `bal login` o API key), mismo RLS que la web.
-- service_role solo en Edge Functions y scripts de admin.
-- ============================================================

-- ACCOUNTS: separar policies por operacion para control granular
alter table accounts enable row level security;

create policy "accounts_select" on accounts
  for select using ((select auth.uid()) = user_id);

create policy "accounts_insert" on accounts
  for insert with check ((select auth.uid()) = user_id);

create policy "accounts_update" on accounts
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy = no se pueden borrar cuentas via API
-- (solo archivar via update is_archived = true)

-- TRANSACTIONS: misma separacion
alter table transactions enable row level security;

create policy "transactions_select" on transactions
  for select using ((select auth.uid()) = user_id);

create policy "transactions_insert" on transactions
  for insert with check ((select auth.uid()) = user_id);

-- No update policy = transacciones son inmutables
-- (se corrigen con undo_transaction que crea una nueva)

-- No delete policy = no se pueden borrar transacciones

-- DEBTS
alter table debts enable row level security;

create policy "debts_select" on debts
  for select using ((select auth.uid()) = user_id);

create policy "debts_insert" on debts
  for insert with check ((select auth.uid()) = user_id);

create policy "debts_update" on debts
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- SNAPSHOTS: inmutables despues de creados
alter table snapshots enable row level security;

create policy "snapshots_select" on snapshots
  for select using ((select auth.uid()) = user_id);

create policy "snapshots_insert" on snapshots
  for insert with check ((select auth.uid()) = user_id);

-- No update ni delete = inmutables

-- INVOICES (SpA)
alter table invoices enable row level security;

create policy "invoices_select" on invoices
  for select using ((select auth.uid()) = user_id);

create policy "invoices_insert" on invoices
  for insert with check ((select auth.uid()) = user_id);

create policy "invoices_update" on invoices
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- AUDIT LOG: solo lectura, inserts via trigger (SECURITY DEFINER)
alter table audit_log enable row level security;

create policy "audit_read_own" on audit_log
  for select using ((select auth.uid()) = user_id);

-- No insert/update/delete policy para usuarios.
-- El trigger audit_trigger() es SECURITY DEFINER para poder insertar.

-- CATEGORIES: lectura publica, escritura solo admin
alter table categories enable row level security;

create policy "categories_read" on categories
  for select using (true);

-- Solo service_role puede insertar/modificar categorias
```

### 5. Constraints a nivel de base de datos

La DB valida la integridad ANTES de que cualquier logica de aplicacion corra.

```sql
-- ACCOUNTS
alter table accounts add constraint positive_credit_limit
  check (credit_limit is null or credit_limit > 0);

alter table accounts add constraint credit_limit_only_for_cc
  check (subtype = 'credit_card' or credit_limit is null);

-- Prevenir archivado de cuentas con deudas activas
create function check_archive_allowed() returns trigger as $$
begin
  if NEW.is_archived = true and OLD.is_archived = false then
    if exists (select 1 from debts where account_id = NEW.id and status = 'active') then
      raise exception 'Cannot archive account with active debts';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger prevent_archive_with_debts
  before update on accounts
  for each row execute function check_archive_allowed();

-- TRANSACTIONS
alter table transactions add constraint valid_transfer
  check (type != 'transfer' or transfer_to is not null);

alter table transactions add constraint no_zero_amount
  check (amount != 0);

alter table transactions add constraint debt_payment_has_debt
  check (type != 'debt_payment' or debt_id is not null);

-- DEBTS
alter table debts add constraint positive_installments
  check (installments > 0);

alter table debts add constraint valid_installments_paid
  check (installments_paid >= 0 and installments_paid <= installments);

alter table debts add constraint consistent_remaining
  check (remaining_amount >= 0);

alter table debts add constraint total_equals_installments
  check (
    total_amount = installment_amount * (installments - 1) + last_installment_amount
  );

-- SNAPSHOTS
alter table snapshots add constraint net_worth_consistent
  check (net_worth = total_assets - total_liabilities);

-- Unique: un snapshot por fecha por usuario
alter table snapshots add constraint unique_snapshot_per_date
  unique (user_id, date);

-- INVOICES
alter table invoices add constraint valid_tax
  check (tax_amount = round(net_amount * 0.19));

alter table invoices add constraint valid_total
  check (total_amount = net_amount + tax_amount);

alter table invoices add constraint valid_amount_paid
  check (amount_paid >= 0 and amount_paid <= total_amount);
```

### 6. Error log y observabilidad

```sql
create table error_log (
  id bigint generated always as identity primary key,
  function_name text not null,
  error_message text not null,
  error_detail text,
  context jsonb default '{}',
  created_at timestamptz not null default now()
);

-- Lectura solo para service_role (Edge Functions y admin scripts)
alter table error_log enable row level security;
-- Sin policies = solo service_role ve los errores (CLI no tiene acceso)
```

### 7. Soft delete y archivado

```sql
-- Nunca DELETE real en tablas financieras.
-- Usar is_archived o status.

-- Accounts: archivar en vez de borrar
-- Ya tiene: is_archived boolean default false
-- Constraint: no se puede archivar si tiene deudas activas (trigger check_archive_allowed)

-- Debts: status 'archived' en vez de delete
-- Ya tiene: status enum ('active', 'paid', 'archived')

-- Transactions: NUNCA borrar. Corregir con undo_transaction().

-- Snapshots: INMUTABLES. No se modifican ni borran.
```

### 8. Resumen de garantias

```
ATOMICIDAD:
  Cada DB function es una transaccion atomica.
  Falla un paso → se revierte todo.

CONCURRENCIA:
  balance + p_amount (atomico, no race condition)
  version column para updates completos
  advisory locks para snapshots

ROLLBACK:
  undo_transaction() crea compensacion inversa
  Nunca borra, siempre agrega

AUDITORIA:
  Trigger automatico en todas las tablas financieras
  audit_log inmutable (no update, no delete)
  Cada cambio queda registrado con old/new data

SEGURIDAD (RLS):
  Deny by default (RLS habilitado, sin policy = sin acceso)
  Policies usan (select auth.uid()) para performance (evaluado una vez)
  Policies separadas por operacion (select/insert/update)
  No delete policy en transactions ni snapshots (inmutables)
  service_role solo para Edge Functions y admin scripts (NO para CLI)
  audit_trigger es SECURITY DEFINER (unico caso)
  Views usan security_invoker = true + where user_id = auth.uid()

INTEGRIDAD:
  CHECK constraints validan datos antes de insertar
  UNIQUE constraints previenen duplicados (user_id+name en accounts)
  FK constraints mantienen relaciones
  NOT NULL donde corresponde
  Trigger previene archivado de cuentas con deudas activas

RECONCILIACION:
  Position = sum(balance) de cuentas on_budget (signos naturales)
  Accumulated = sum(amount) de income + expense + refund + adjustment
  Transfers y debt_payments no afectan accumulated
  Compras en cuotas: gasto total al comprar, cuotas como debt_payment
  Delta = Position - Accumulated = 0 si todo cuadra

SEPARACION:
  Capa 1: primitivas SQL puras (_insert, _update)
  Capa 2: operaciones de negocio (compose primitivas)
  Capa 3: queries de lectura (views, funciones read-only)
  Error en capa 1 → sabes exactamente que fallo
  Error en capa 2 → ves que primitiva fallo y con que datos
```

---

## CLI: `bal`

Built con `commander` + `@inquirer/prompts` (interactivo cuando hace falta).

### Comandos

```
bal                             Muestra estado rapido (patrimonio + delta)
bal login                       Login con email/password
bal logout                      Borrar credenciales locales
bal whoami                      Mostrar usuario actual y metodo de auth
bal accounts                    Lista cuentas activas
bal accounts add                Crear cuenta (interactivo)
bal accounts update <id>        Actualizar saldo
bal add <monto>                 Registrar gasto/ingreso
  --cat, -c <categoria>
  --acc, -a <cuenta>
  --desc, -d <descripcion>
  --date <YYYY-MM-DD>
  --cuotas, -q <n>             Compra en cuotas
bal check                       Estado de reconciliacion (delta)
bal snapshot                    Guardar cierre
bal snapshot list               Listar cierres anteriores
bal summary                     Resumen mes actual
bal summary --month 2026-03     Resumen mes especifico
bal debts                       Deudas activas
bal debts pay <id>              Registrar pago de cuota
bal import                      Importar data desde Excel
```

### Output format

Por defecto human-readable. Con `--json` devuelve JSON para bots:

```bash
$ bal check
Patrimonio:  700,000
Acumulado:   650,000
Delta:       50,000  ● Pendiente

$ bal check --json
{"position":4673786,"accumulated":4410032,"delta":263754,"is_balanced":false}

$ bal summary
Abril 2026
  Ingresos:    $2,285,000
  Gastos:     -$331,499
  Balance:     $1,953,501

  Necesidades:  $192,999  (8.4%)
  Consumo:      30,000  (6.1%)
  Ahorro:       $100,000  (4.4%)
```

---

## Web: Vite + React

### Stack

```
Vite 6
React 19
TanStack Router     — routing type-safe
TanStack Query      — data fetching + cache
Tailwind CSS v4     — styling
Geist Sans/Mono     — tipografia
Framer Motion       — animaciones numeros, layout
cmdk                — command palette (⌘K)
Recharts            — graficos patrimonio
supabase-js         — cliente de datos
```

### Data flow

```
Component
  → useQuery('accounts', () => getAccounts(supabase))
    → packages/core/accounts.ts
      → supabase.from('accounts').select('*')
        → PostgreSQL (con RLS)

Mutation
  → useMutation(() => createTransaction(supabase, data))
    → packages/core/transactions.ts
      → supabase.rpc('create_transaction', {...})
        → PostgreSQL function
          → actualiza balance
    → invalidateQueries(['accounts', 'reconciliation'])
      → UI se actualiza automaticamente
```

### Realtime (opcional)

Si la CLI registra algo mientras la web esta abierta:

```typescript
supabase
  .channel('changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' },
    () => queryClient.invalidateQueries()
  )
  .subscribe()
```

---

## Skills de Claude Code

En `.claude/commands/` del proyecto:

```markdown
<!-- .claude/commands/bal-add.md -->
Registra un movimiento financiero usando el CLI `bal`.
Parsea lo que el usuario dice en lenguaje natural y ejecuta:
`bun run apps/cli/src/index.ts add <monto> --cat <categoria> --acc <cuenta> --desc <descripcion>`
Si no queda claro el monto, categoria o cuenta, pregunta antes de ejecutar.
```

```markdown
<!-- .claude/commands/bal-check.md -->
Ejecuta `bun run apps/cli/src/index.ts check --json` y muestra
el estado de reconciliacion de forma legible.
Si hay delta != 0, sugiere posibles causas.
```

```markdown
<!-- .claude/commands/bal-summary.md -->
Ejecuta `bun run apps/cli/src/index.ts summary --json`
y presenta un resumen del mes actual.
Incluye comparacion con el mes anterior si hay data.
```

---

## Deploy

```
Web (SPA estatico):
  Vercel / Cloudflare Pages
  Build: `cd apps/web && bun run build`
  Output: dist/ (static files)
  Costo: gratis

Supabase:
  Supabase Cloud (free tier: 500MB DB, 1GB storage)
  O self-hosted si crece

CLI:
  Local (bun run) o compilado con `bun build --compile`
  Se puede publicar en npm si quieres
```
