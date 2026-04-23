-- Layer 1: Debt Primitives (single responsibility, no business rules)

-- Create a debt record with calculated installment schedule.
-- Last installment absorbs integer division rounding (D-05).
-- Grace period: p_first_payment_date can differ from p_start_date (D-04).
create function _create_debt(
  p_user_id uuid, p_account_id uuid, p_description text,
  p_total bigint, p_installments int, p_category text,
  p_start_date date, p_first_payment_date date default null
) returns debts as $$
declare
  v_installment bigint;
  v_last_installment bigint;
  v_first_pay date;
  v_result debts;
begin
  v_installment := p_total / p_installments;
  v_last_installment := p_total - (v_installment * (p_installments - 1));
  v_first_pay := coalesce(p_first_payment_date, (p_start_date + interval '1 month')::date);

  insert into debts (
    user_id, account_id, description, total_amount,
    installments, installment_amount, last_installment_amount,
    installments_paid, remaining_amount, category,
    start_date, first_payment_date, next_payment_date
  ) values (
    p_user_id, p_account_id, p_description, p_total,
    p_installments, v_installment, v_last_installment,
    0, p_total, p_category,
    p_start_date, v_first_pay, v_first_pay
  ) returning * into v_result;

  return v_result;
end;
$$ language plpgsql;

-- Advance debt payment counter after recording a payment.
-- Returns updated debt. Marks as 'paid' when all installments complete.
create function _advance_debt_payment(p_debt_id uuid)
returns debts as $$
declare
  v_debt debts;
  v_payment_amount bigint;
  v_result debts;
begin
  select * into strict v_debt from debts where id = p_debt_id;

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
      when installments_paid + 1 >= installments then 'paid'
      else 'active'
    end,
    updated_at = now()
  where id = p_debt_id
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql;
