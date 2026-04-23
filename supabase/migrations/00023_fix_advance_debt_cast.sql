-- Fix: _advance_debt_payment needs explicit cast to debt_status enum
-- The CASE expression returns text, but status column is debt_status type

create or replace function _advance_debt_payment(p_debt_id uuid)
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
      when installments_paid + 1 >= installments then 'paid'::debt_status
      else 'active'::debt_status
    end,
    updated_at = now()
  where id = p_debt_id
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql;
