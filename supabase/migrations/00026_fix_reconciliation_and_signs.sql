-- Fix reconciliation formula and sign conventions
-- Problem: adjustments were treated like expenses (-t.amount) causing 2x delta shift
-- Fix: adjustments use +t.amount so they're neutral to delta (balance sync = zero delta impact)
-- Also fixes create_transaction and create_installment_purchase sign handling

-- 1. Fix reconciliation_status view
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
       when t.type in ('expense', 'refund') then -t.amount
       when t.type = 'adjustment' then t.amount
       else 0
     end
   ), 0)
   from transactions t
   where t.type in ('income', 'expense', 'refund', 'adjustment')
     and t.user_id = (select auth.uid())) as delta;

-- 2. Fix get_reconciliation_status to use updated view
create or replace function get_reconciliation_status()
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

-- 3. Fix create_transaction: ensure expense amounts are stored as positive
-- and balance is updated correctly (negative for expenses)
create or replace function create_transaction(
  p_amount bigint, p_category text,
  p_account_id uuid, p_description text,
  p_type transaction_type default null,
  p_date date default current_date
) returns jsonb as $$
declare
  v_account accounts;
  v_tx transactions;
  v_store_amount bigint;
  v_balance_delta bigint;
begin
  select * into strict v_account from accounts where id = p_account_id;

  if p_type is null then
    p_type := case when p_amount >= 0 then 'income' else 'expense' end;
  end if;

  -- Normalize: store absolute amount, sign determined by type
  v_store_amount := abs(p_amount);
  -- Balance delta: income adds, expense/refund subtracts
  v_balance_delta := case
    when p_type = 'income' then v_store_amount
    when p_type in ('expense', 'refund') then -v_store_amount
    when p_type = 'adjustment' then p_amount  -- adjustments keep original sign
    else p_amount
  end;

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, p_type,
    v_store_amount, p_category, p_description,
    v_account.entity, p_date
  );

  perform _update_account_balance(p_account_id, v_balance_delta);

  return to_jsonb(v_tx);
end;
$$ language plpgsql;

-- 4. Fix create_installment_purchase: expense should decrease balance
create or replace function create_installment_purchase(
  p_amount bigint,
  p_installments int,
  p_category text,
  p_account_id uuid,
  p_description text,
  p_date date default current_date,
  p_first_payment_date date default null
) returns jsonb as $$
declare
  v_account accounts;
  v_debt debts;
  v_tx transactions;
  v_store_amount bigint;
begin
  select * into strict v_account from accounts where id = p_account_id;

  v_store_amount := abs(p_amount);

  v_debt := _create_debt(
    v_account.user_id, p_account_id, p_description,
    v_store_amount, p_installments, p_category, p_date, p_first_payment_date
  );

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, 'expense',
    v_store_amount, p_category,
    p_description || ' (' || p_installments || ' cuotas)',
    v_account.entity, p_date, v_debt.id
  );

  -- Expense always decreases balance (negative delta)
  perform _update_account_balance(p_account_id, -v_store_amount);

  return jsonb_build_object(
    'debt', to_jsonb(v_debt),
    'transaction', to_jsonb(v_tx),
    'patrimony_impact', -v_store_amount,
    'installment_amount', v_debt.installment_amount,
    'last_installment_amount', v_debt.last_installment_amount
  );

exception when others then
  insert into error_log (function_name, error_message, error_detail, context)
  values ('create_installment_purchase', SQLERRM, SQLSTATE,
    jsonb_build_object('amount', p_amount, 'account', p_account_id));
  raise;
end;
$$ language plpgsql security definer;
