-- Reconciliation: core value of the app
-- Position (real balances) vs Accumulated (transaction log) = Delta
-- Per D-03: VIEW with security_invoker=true
-- Per D-04: transfers and debt_payments excluded from accumulated

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
       when t.type in ('expense', 'refund', 'adjustment') then -t.amount
       else 0
     end
   ), 0)
   from transactions t
   where t.type in ('income', 'expense', 'refund', 'adjustment')
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
       when t.type in ('expense', 'refund', 'adjustment') then -t.amount
       else 0
     end
   ), 0)
   from transactions t
   where t.type in ('income', 'expense', 'refund', 'adjustment')
     and t.user_id = (select auth.uid())) as delta;

-- Per RECON-02: structured jsonb with delta_status thresholds
-- green (=0), amber (abs < 1000), red (abs >= 1000)
create function get_reconciliation_status()
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_result record;
begin
  select * into v_result from reconciliation_status;

  return jsonb_build_object(
    'position', v_result.position,
    'accumulated', v_result.accumulated,
    'delta', v_result.delta,
    'is_balanced', v_result.delta = 0,
    'delta_status', case
      when v_result.delta = 0 then 'green'
      when abs(v_result.delta) < 1000 then 'amber'
      else 'red'
    end
  );
end;
$$;
