-- Refine: accumulated should include transactions on archived on-budget accounts.
--
-- Rationale: archiving an account soft-deletes it (balance becomes irrelevant to position)
-- but the historical transactions still represent real economic events. If a receivable
-- had a payment adjustment that balanced with an income on another account, filtering
-- out the archived side breaks accumulated consistency.
--
-- Keeps the on_budget filter (off-budget accounts like Fintual/properties stay excluded)
-- but removes the is_archived filter added in 20260424033500.

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
     and t.user_id = (select auth.uid())) as delta;
