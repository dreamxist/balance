-- Migration 00030: Balance System Audit Fixes
-- Fixes bugs found in audit of cuadrar/movimientos/deudas systems.
-- Context: .planning/phases/10-balance-system-audit-fixes/CONTEXT.md
--
-- BUG 02: undo_transaction must validate type and use correct reverse delta
-- BUG 03: refund must INCREASE balance (UI shows +/green, user semantic is
--         "Devolucion" = product return = money coming back). DB layer
--         previously treated refund same as expense (decreased balance),
--         causing UI/DB disagreement.
-- BUG 04: credit_card_status formula (subtract future installments, not add)
-- BUG 05: create_installment_purchase must validate liability account type
-- BUG 06: transactions CHECK amount <> 0 (NOT VALID to grandfather old rows)
-- BUG 07: recurring_charges CHECK amount > 0
-- BUG 08: pay_off_debt must validate p_actual_amount > 0
-- BUG 11: _advance_debt_payment must lock row for update to prevent race

-- =============================================================================
-- BUG 03: refund sign convention — refund is money coming back (balance +)
-- =============================================================================
-- UI sends refund as positive amount and displays it in green with "+".
-- Previously the DB treated refund identically to expense (decreased balance),
-- creating silent UI/DB disagreement. Fix: refund now increases balance and
-- adds to accumulated, symmetric to income.

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
  v_balance_delta := case
    when p_type = 'income' then v_store_amount
    when p_type = 'refund' then v_store_amount  -- BUG 03: money coming back
    when p_type = 'expense' then -v_store_amount
    when p_type = 'adjustment' then p_amount    -- keeps original sign
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

-- Fix reconciliation_status view to treat refund as +accumulated
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
       when t.type = 'refund' then t.amount    -- BUG 03: refund increases accumulated
       when t.type = 'expense' then -t.amount
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
       when t.type = 'refund' then t.amount
       when t.type = 'expense' then -t.amount
       when t.type = 'adjustment' then t.amount
       else 0
     end
   ), 0)
   from transactions t
   where t.type in ('income', 'expense', 'refund', 'adjustment')
     and t.user_id = (select auth.uid())) as delta;

-- Fix monthly_summary view to subtract refunds from expenses
drop view if exists monthly_summary;

create view monthly_summary with (security_invoker = true) as
select
  date_trunc('month', date) as month,
  entity,
  category,
  type,
  sum(case when type = 'income' then amount else 0 end) as income,
  sum(case when type = 'expense' then amount
           when type = 'refund' then -amount
           else 0 end) as expenses,
  sum(case when type in ('income', 'refund') then amount
           when type = 'expense' then -amount
           else 0 end) as net,
  count(*) as tx_count
from transactions
where user_id = (select auth.uid())
  and type in ('income', 'expense', 'refund')
group by 1, 2, 3, 4;

-- =============================================================================
-- BUG 02: undo_transaction — reject non-undoable types, correct reverse delta
-- =============================================================================
-- Previously, undo always created an adjustment with -v_original.amount.
-- This was wrong for expense/refund (which store positive but decrease balance),
-- and allowed undoing transfer/debt_payment (which shouldn't go through
-- adjustment since they don't affect accumulated).

create or replace function undo_transaction(p_transaction_id uuid)
returns jsonb as $$
declare
  v_original transactions;
  v_reversal transactions;
  v_reverse_delta bigint;
begin
  select * into strict v_original
  from transactions
  where id = p_transaction_id
    and user_id = (select auth.uid());

  if v_original.type not in ('income', 'expense', 'refund', 'adjustment') then
    raise exception
      'Cannot undo transaction of type %. Transfers and debt_payments require dedicated reversal operations.',
      v_original.type;
  end if;

  -- Compute the balance delta that reverses the original effect.
  -- After BUG 03 fix: income and refund increase balance (delta=+amount),
  -- expense decreases balance (delta=-amount), adjustment keeps signed amount.
  -- So the reverse delta is the negation of the original delta.
  v_reverse_delta := case
    when v_original.type in ('income', 'refund') then -v_original.amount
    when v_original.type = 'expense' then v_original.amount
    when v_original.type = 'adjustment' then -v_original.amount
  end;

  v_reversal := _insert_transaction(
    v_original.user_id, v_original.account_id, 'adjustment',
    v_reverse_delta, v_original.category,
    'Undo: ' || v_original.description,
    v_original.entity, current_date,
    v_original.debt_id
  );

  perform _update_account_balance(v_original.account_id, v_reverse_delta);

  return jsonb_build_object(
    'original', to_jsonb(v_original),
    'reversal', to_jsonb(v_reversal)
  );
end;
$$ language plpgsql;

-- =============================================================================
-- BUG 04: credit_card_status — subtract future installments from available
-- =============================================================================
-- Credit card balance is stored negative (liability debt).
-- available = credit_limit + balance - future_installments
-- Previously had "+ future_installments" which inflated available credit.

drop view if exists credit_card_status;

create view credit_card_status with (security_invoker = true) as
select
  a.id,
  a.name,
  a.balance as statement_balance,
  coalesce(sum(d.remaining_amount), 0) as future_installments,
  abs(a.balance) + coalesce(sum(d.remaining_amount), 0) as total_used,
  a.credit_limit,
  a.credit_limit + a.balance - coalesce(sum(d.remaining_amount), 0) as available
from accounts a
left join debts d on d.account_id = a.id and d.status = 'active'
where a.subtype = 'credit_card'
  and a.user_id = (select auth.uid())
group by a.id;

-- =============================================================================
-- BUG 05: create_installment_purchase — validate account is liability
-- =============================================================================

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

  if v_account.type <> 'liability' then
    raise exception
      'Compras en cuotas solo permitidas en cuentas de credito (liability). Cuenta % es tipo %.',
      v_account.name, v_account.type;
  end if;

  if p_amount <= 0 then
    raise exception 'Monto de compra debe ser positivo, recibido %', p_amount;
  end if;

  if p_installments < 1 then
    raise exception 'Numero de cuotas debe ser >= 1, recibido %', p_installments;
  end if;

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

-- =============================================================================
-- BUG 06: transactions must have non-zero amount
-- =============================================================================
-- NOT VALID so existing rows are grandfathered; only new inserts/updates checked.
-- Transfers store from-side as negative, to-side as positive, so <> 0 is safe.
-- Adjustments can be positive or negative to correct balance.

alter table transactions
  add constraint transactions_amount_nonzero
  check (amount <> 0)
  not valid;

-- =============================================================================
-- BUG 07: recurring_charges must have positive amount
-- =============================================================================

alter table recurring_charges
  add constraint recurring_charges_amount_positive
  check (amount > 0)
  not valid;

-- =============================================================================
-- BUG 08: pay_off_debt — validate p_actual_amount, lock debt row
-- =============================================================================

create or replace function pay_off_debt(
  p_debt_id uuid,
  p_actual_amount bigint default null
) returns jsonb as $$
declare
  v_debt debts;
  v_account accounts;
  v_remaining bigint;
  v_discount bigint;
begin
  -- Lock the row to prevent concurrent payoff attempts
  select * into v_debt from debts
  where id = p_debt_id and status = 'active'
  for update;
  if not found then raise exception 'Debt not found or not active'; end if;

  if p_actual_amount is not null then
    if p_actual_amount <= 0 then
      raise exception 'actual_amount debe ser positivo, recibido %', p_actual_amount;
    end if;
    if p_actual_amount > v_debt.remaining_amount then
      raise exception 'actual_amount (%) excede remaining (%)',
        p_actual_amount, v_debt.remaining_amount;
    end if;
  end if;

  select * into v_account from accounts where id = v_debt.account_id;
  v_remaining := v_debt.remaining_amount;

  if p_actual_amount is not null and p_actual_amount < v_remaining then
    v_discount := v_remaining - p_actual_amount;
    perform _insert_transaction(
      v_account.user_id, v_debt.account_id, 'adjustment',
      v_discount, v_debt.category,
      'Descuento en liquidacion: ' || v_debt.description,
      v_account.entity, current_date, p_debt_id
    );
    perform _update_account_balance(v_debt.account_id, v_discount);
  end if;

  perform _insert_transaction(
    v_account.user_id, v_debt.account_id, 'debt_payment',
    coalesce(p_actual_amount, v_remaining), v_debt.category,
    'Liquidacion: ' || v_debt.description,
    v_account.entity, current_date, p_debt_id
  );

  update debts set
    installments_paid = installments,
    remaining_amount = 0,
    status = 'paid',
    updated_at = now()
  where id = p_debt_id;

  return jsonb_build_object('debt_id', p_debt_id, 'status', 'paid');
end;
$$ language plpgsql security definer;

-- =============================================================================
-- BUG 11: _advance_debt_payment — lock row to prevent race condition
-- =============================================================================
-- Previously, concurrent calls could both read installments_paid=N and each
-- attempt to increment to N+1, causing double payment or inconsistent state.

create or replace function _advance_debt_payment(p_debt_id uuid)
returns debts as $$
declare
  v_debt debts;
  v_payment_amount bigint;
  v_result debts;
begin
  select * into strict v_debt from debts
  where id = p_debt_id
  for update;

  if v_debt.status <> 'active' then
    raise exception 'Cannot advance debt %: status is %', p_debt_id, v_debt.status;
  end if;

  if v_debt.installments_paid + 1 = v_debt.installments then
    v_payment_amount := v_debt.last_installment_amount;
  else
    v_payment_amount := v_debt.installment_amount;
  end if;

  update debts set
    installments_paid = installments_paid + 1,
    remaining_amount = remaining_amount - v_payment_amount,
    next_payment_date = (next_payment_date + interval '1 month')::date,
    status = case
      when installments_paid + 1 >= installments then 'paid'::debt_status
      else 'active'::debt_status
    end,
    updated_at = now()
  where id = p_debt_id
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql;
