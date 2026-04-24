-- Fix: accumulated should only include transactions on on-budget accounts.
--
-- Previously accumulated summed transactions across ALL accounts (on- and off-budget),
-- while position only summed on-budget account balances. Any adjustment transaction
-- on an off-budget account (e.g. Fintual balance update via update_account_balance_manual)
-- would shift accumulated without moving position, breaking delta.
--
-- Fix: join transactions with accounts and filter accumulated by a.on_budget = true,
-- symmetric to how position is computed.

drop view if exists reconciliation_status;

create view reconciliation_status with (security_invoker = true) as
select
  (select coalesce(sum(a.balance), 0)
   from accounts a
   where not a.is_archived
     and a.on_budget = true
     and a.user_id = (select auth.uid())) as position,

  (select coalesce(sum(
     case
       when t.type = 'income' then t.amount
       when t.type in ('expense', 'refund') then -t.amount
       when t.type = 'adjustment' then t.amount
       else 0
     end
   ), 0)
   from transactions t
   join accounts a on a.id = t.account_id
   where t.type in ('income', 'expense', 'refund', 'adjustment')
     and a.on_budget = true
     and not a.is_archived
     and t.user_id = (select auth.uid())) as accumulated,

  (select coalesce(sum(a.balance), 0)
   from accounts a
   where not a.is_archived
     and a.on_budget = true
     and a.user_id = (select auth.uid()))
  -
  (select coalesce(sum(
     case
       when t.type = 'income' then t.amount
       when t.type in ('expense', 'refund') then -t.amount
       when t.type = 'adjustment' then t.amount
       else 0
     end
   ), 0)
   from transactions t
   join accounts a on a.id = t.account_id
   where t.type in ('income', 'expense', 'refund', 'adjustment')
     and a.on_budget = true
     and not a.is_archived
     and t.user_id = (select auth.uid())) as delta;
