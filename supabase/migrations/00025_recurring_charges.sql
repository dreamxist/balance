create table recurring_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  amount bigint not null,
  currency text not null default 'CLP',
  day_of_month integer not null check (day_of_month between 1 and 31),
  category text not null,
  account_id uuid references accounts(id) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recurring_user on recurring_charges(user_id);
alter table recurring_charges enable row level security;

create policy "recurring_select" on recurring_charges
  for select using ((select auth.uid()) = user_id);
create policy "recurring_insert" on recurring_charges
  for insert with check ((select auth.uid()) = user_id);
create policy "recurring_update" on recurring_charges
  for update using ((select auth.uid()) = user_id);
create policy "recurring_delete" on recurring_charges
  for delete using ((select auth.uid()) = user_id);
