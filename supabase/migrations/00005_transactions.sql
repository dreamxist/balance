create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  account_id uuid references accounts(id) not null,
  type transaction_type not null,
  amount bigint not null,
  description text not null,
  category text,
  entity entity_type not null default 'personal',
  date date not null default current_date,
  debt_id uuid,          -- NO FK here, debts table created in Phase 3
  transfer_to uuid,      -- references accounts(id) added in Phase 3
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
  -- Immutable table per D-02: no update timestamp column
);

create index idx_transactions_user_date on transactions(user_id, date desc);
create index idx_transactions_date on transactions(date desc);
create index idx_transactions_account on transactions(account_id);
create index idx_transactions_category on transactions(category);
create index idx_transactions_entity on transactions(entity);
