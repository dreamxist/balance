-- Layer 2: Debt Operations (compose primitives with business logic)

-- Compra en cuotas (D-02, D-03)
-- Registers TOTAL as expense at purchase time.
-- Monthly payments are debt_payment (do NOT affect accumulated).
create function create_installment_purchase(
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
begin
  select * into strict v_account from accounts where id = p_account_id;

  v_debt := _create_debt(
    v_account.user_id, p_account_id, p_description,
    abs(p_amount), p_installments, p_category, p_date, p_first_payment_date
  );

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, 'expense',
    p_amount, p_category,
    p_description || ' (' || p_installments || ' cuotas)',
    v_account.entity, p_date, v_debt.id
  );

  perform _update_account_balance(p_account_id, p_amount);

  return jsonb_build_object(
    'debt', to_jsonb(v_debt),
    'transaction', to_jsonb(v_tx),
    'patrimony_impact', p_amount,
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

-- Pagar cuota de deuda (D-03, D-04, D-05)
-- Type 'debt_payment': does NOT affect accumulated or patrimony.
-- Does NOT update account balance (TC balance was reduced at purchase time).
create function pay_debt_installment(
  p_debt_id uuid,
  p_date date default current_date
) returns jsonb as $$
declare
  v_debt debts;
  v_tx transactions;
  v_payment_amount bigint;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'active';
  if not found then
    raise exception 'Deuda no encontrada o ya pagada';
  end if;

  if v_debt.installments_paid + 1 = v_debt.installments then
    v_payment_amount := v_debt.last_installment_amount;
  else
    v_payment_amount := v_debt.installment_amount;
  end if;

  v_tx := _insert_transaction(
    v_debt.user_id, v_debt.account_id, 'debt_payment',
    v_payment_amount, v_debt.category,
    v_debt.description || ' (cuota ' || (v_debt.installments_paid + 1) || '/' || v_debt.installments || ')',
    (select entity from accounts where id = v_debt.account_id),
    p_date, p_debt_id
  );

  v_debt := _advance_debt_payment(p_debt_id);

  return jsonb_build_object(
    'transaction', to_jsonb(v_tx),
    'remaining', v_debt.remaining_amount,
    'installments_left', v_debt.installments - v_debt.installments_paid
  );
end;
$$ language plpgsql security definer;

-- Pagar deuda completa (lump-sum payoff, con descuento opcional) (INST-06)
create function pay_off_debt(
  p_debt_id uuid,
  p_actual_amount bigint default null
) returns jsonb as $$
declare
  v_debt debts;
  v_account accounts;
  v_remaining bigint;
  v_discount bigint;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'active';
  if not found then raise exception 'Debt not found or not active'; end if;

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

-- Archive debt (INST-08): for product returns after refund
create function archive_debt(p_debt_id uuid)
returns jsonb as $$
begin
  update debts set
    status = 'archived',
    remaining_amount = 0,
    updated_at = now()
  where id = p_debt_id
    and user_id = (select auth.uid());

  if not found then
    raise exception 'Debt not found or not owned by user';
  end if;

  return jsonb_build_object('debt_id', p_debt_id, 'status', 'archived');
end;
$$ language plpgsql security definer;
