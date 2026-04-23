-- Receivable payment operation (D-08, D-09, RECV-02, RECV-03)
-- Uses create_transfer internally (not income) per Pitfall 4:
-- receiving a payment from a receivable is moving money, not earning it.

create function receive_payment(
  p_receivable_id uuid,
  p_destination_id uuid,
  p_amount bigint,
  p_description text,
  p_date date default current_date
) returns jsonb as $$
declare
  v_receivable accounts;
  v_transfer_result jsonb;
  v_new_balance bigint;
  v_auto_archived boolean := false;
begin
  select * into strict v_receivable
  from accounts
  where id = p_receivable_id
    and subtype = 'receivable'
    and not is_archived;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  if p_amount > v_receivable.balance then
    raise exception 'Payment amount (%) exceeds receivable balance (%)', p_amount, v_receivable.balance;
  end if;

  v_transfer_result := create_transfer(
    p_receivable_id, p_destination_id, p_amount, p_description, p_date
  );

  select balance into v_new_balance
  from accounts
  where id = p_receivable_id;

  if v_new_balance = 0 then
    update accounts
    set is_archived = true, updated_at = now()
    where id = p_receivable_id;
    v_auto_archived := true;
  end if;

  return jsonb_build_object(
    'transfer', v_transfer_result,
    'receivable_balance', v_new_balance,
    'auto_archived', v_auto_archived
  );
end;
$$ language plpgsql security definer;
