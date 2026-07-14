-- Gmail ingestion staging: parsed bank emails land in email_movements as
-- 'pending', then promote_email_movements (separate migration) turns them into
-- transactions. categorization_rules maps merchant substrings to categories.
-- Account matching convention: accounts.metadata carries the identifiers seen
-- in emails ({"bank_account_numbers": [], "card_last4": "1234"}).

create table email_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  gmail_message_id text unique not null,
  source text not null check (source in (
    'bancochile_tc', 'bancochile_pago', 'bancochile_transfer_out',
    'bancochile_transfer_in', 'bancochile_pago_tc',
    'bice_transfer_out', 'bice_transfer_in', 'bice_pago_tc',
    'mp_transfer_out', 'tenpo_transfer_in', 'bci_spa'
  )),
  amount bigint,
  currency text check (currency in ('CLP', 'USD')),
  counterparty text,
  merchant text,
  account_hint text,
  email_date timestamptz,
  bank_tx_id text,
  status text not null default 'pending'
    check (status in ('pending', 'promoted', 'discarded', 'error')),
  transaction_id uuid references transactions(id),
  raw_snippet text,
  error_detail text,
  created_at timestamptz not null default now()
);

create index idx_email_movements_user on email_movements(user_id);
create index idx_email_movements_pending on email_movements(user_id, created_at)
  where status = 'pending';

alter table email_movements enable row level security;

create policy "email_movements_select" on email_movements
  for select using ((select auth.uid()) = user_id);
create policy "email_movements_insert" on email_movements
  for insert with check ((select auth.uid()) = user_id);
create policy "email_movements_update" on email_movements
  for update using ((select auth.uid()) = user_id);
create policy "email_movements_delete" on email_movements
  for delete using ((select auth.uid()) = user_id);

create table categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  pattern text not null check (length(trim(pattern)) > 0),
  category text references categories(id) not null,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_categorization_rules_user on categorization_rules(user_id);

alter table categorization_rules enable row level security;

create policy "categorization_rules_select" on categorization_rules
  for select using ((select auth.uid()) = user_id);
create policy "categorization_rules_insert" on categorization_rules
  for insert with check ((select auth.uid()) = user_id);
create policy "categorization_rules_update" on categorization_rules
  for update using ((select auth.uid()) = user_id);
create policy "categorization_rules_delete" on categorization_rules
  for delete using ((select auth.uid()) = user_id);
