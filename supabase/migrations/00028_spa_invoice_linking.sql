-- SpA invoice linking + reimbursables + factura storage

-- 1. Link transactions to SpA invoices (gasto personal asociado a factura SpA)
alter table transactions
  add column linked_invoice_id uuid references spa_invoices(id),
  add column reimbursable boolean not null default false;

create index idx_transactions_linked_invoice on transactions(linked_invoice_id)
  where linked_invoice_id is not null;
create index idx_transactions_reimbursable on transactions(user_id)
  where reimbursable = true;

-- 2. Factura file URL on spa_invoices
alter table spa_invoices
  add column factura_url text;

-- 3. Private bucket for factura files
insert into storage.buckets (id, name, public)
  values ('facturas', 'facturas', false)
  on conflict do nothing;

-- Users can read their own facturas (folder = user_id)
create policy "Users read own facturas" on storage.objects
  for select using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Users can upload their own facturas
create policy "Users upload own facturas" on storage.objects
  for insert with check (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Users can delete their own facturas
create policy "Users delete own facturas" on storage.objects
  for delete using (
    bucket_id = 'facturas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 4. View: reimbursables pendientes (gastos personales que la SpA te debe)
create view spa_reimbursables with (security_invoker = true) as
select
  t.id,
  t.date,
  t.amount,
  t.description,
  t.category,
  t.account_id,
  a.name as account_name,
  t.linked_invoice_id,
  si.counterpart as invoice_counterpart,
  si.total as invoice_total
from transactions t
join accounts a on a.id = t.account_id
left join spa_invoices si on si.id = t.linked_invoice_id
where t.user_id = (select auth.uid())
  and t.reimbursable = true
  and t.entity = 'personal'
  and t.type = 'expense'
order by t.date desc;

-- 5. Helper function: link a transaction to an invoice
create function link_transaction_to_invoice(
  p_transaction_id uuid,
  p_invoice_id uuid,
  p_reimbursable boolean default true
) returns transactions as $$
declare
  v_tx transactions;
begin
  update transactions
    set linked_invoice_id = p_invoice_id,
        reimbursable = p_reimbursable
    where id = p_transaction_id
      and user_id = (select auth.uid())
  returning * into v_tx;

  if not found then
    raise exception 'Transaction not found';
  end if;

  return v_tx;
end;
$$ language plpgsql security definer;
