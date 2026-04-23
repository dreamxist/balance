-- Debts table (D-01): tracks installment purchases and other debts
create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  account_id uuid references accounts(id) not null,
  description text not null,
  total_amount bigint not null check (total_amount > 0),
  installments int not null check (installments > 0),
  installment_amount bigint not null,
  last_installment_amount bigint not null,
  installments_paid int not null default 0,
  remaining_amount bigint not null,
  category text,
  status debt_status not null default 'active',
  start_date date not null default current_date,
  first_payment_date date,
  next_payment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_debts_user on debts(user_id);
create index idx_debts_account on debts(account_id);
create index idx_debts_status on debts(status) where status = 'active';

-- FK constraints on existing transactions table (columns exist since 00005)
alter table transactions
  add constraint fk_transactions_debt
  foreign key (debt_id) references debts(id);

alter table transactions
  add constraint fk_transactions_transfer_to
  foreign key (transfer_to) references accounts(id);
