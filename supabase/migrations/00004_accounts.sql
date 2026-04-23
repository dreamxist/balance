create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  type account_type not null,
  subtype account_subtype not null,
  entity entity_type not null default 'personal',
  currency text not null default 'CLP',
  balance bigint not null default 0,
  credit_limit bigint,
  on_budget boolean not null default true,
  metadata jsonb default '{}',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_user_account_name unique (user_id, name)
);

create index idx_accounts_user on accounts(user_id);

alter table accounts enable row level security;

create policy "accounts_select" on accounts
  for select using ((select auth.uid()) = user_id);

create policy "accounts_insert" on accounts
  for insert with check ((select auth.uid()) = user_id);

create policy "accounts_update" on accounts
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
