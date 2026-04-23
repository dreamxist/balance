-- Read-only views for debt status and monthly reporting
-- All views use security_invoker = true per project conventions

-- Active debts with account name and remaining installments (INST-07)
create view active_debts with (security_invoker = true) as
select
  d.*,
  a.name as account_name,
  d.installments - d.installments_paid as remaining_installments
from debts d
join accounts a on a.id = d.account_id
where d.status = 'active'
  and d.user_id = (select auth.uid());

-- Credit card status: statement balance, future installments, available credit
create view credit_card_status with (security_invoker = true) as
select
  a.id,
  a.name,
  a.balance as statement_balance,
  coalesce(sum(d.remaining_amount), 0) as future_installments,
  a.balance + coalesce(sum(d.remaining_amount), 0) as total_used,
  a.credit_limit,
  a.credit_limit + a.balance + coalesce(sum(d.remaining_amount), 0) as available
from accounts a
left join debts d on d.account_id = a.id and d.status = 'active'
where a.subtype = 'credit_card'
  and a.user_id = (select auth.uid())
group by a.id;

-- Monthly summary: income vs expenses by month, entity, category
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
