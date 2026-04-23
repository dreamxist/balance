-- Transfer operations: same-entity and inter-entity transfers
-- Transfers use type='transfer' which is EXCLUDED from accumulated in reconciliation.
-- This ensures transfers don't affect patrimony (XFER-02).

-- Same-entity transfer (D-06, XFER-01, XFER-02, XFER-03)
create function create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount bigint,
  p_description text,
  p_date date default current_date
) returns jsonb as $$
declare
  v_from accounts;
  v_to accounts;
  v_tx_from transactions;
  v_tx_to transactions;
begin
  select * into strict v_from from accounts where id = p_from_account_id;
  select * into strict v_to from accounts where id = p_to_account_id;

  if p_amount <= 0 then
    raise exception 'Transfer amount must be positive';
  end if;

  v_tx_from := _insert_transaction(
    v_from.user_id, p_from_account_id, 'transfer',
    -p_amount, null, p_description || ' -> ' || v_to.name,
    v_from.entity, p_date, null, p_to_account_id
  );

  v_tx_to := _insert_transaction(
    v_to.user_id, p_to_account_id, 'transfer',
    p_amount, null, p_description || ' <- ' || v_from.name,
    v_to.entity, p_date, null, p_from_account_id
  );

  perform _update_account_balance(p_from_account_id, -p_amount);
  perform _update_account_balance(p_to_account_id, p_amount);

  return jsonb_build_object(
    'from_transaction', to_jsonb(v_tx_from),
    'to_transaction', to_jsonb(v_tx_to),
    'amount', p_amount,
    'patrimony_impact', 0
  );
end;
$$ language plpgsql security definer;

-- Inter-entity transfer (D-07, XFER-04)
create function create_inter_entity_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount bigint,
  p_description text,
  p_date date default current_date
) returns jsonb as $$
declare
  v_from accounts;
  v_to accounts;
  v_tx_from transactions;
  v_tx_to transactions;
begin
  select * into strict v_from from accounts where id = p_from_account_id;
  select * into strict v_to from accounts where id = p_to_account_id;

  if v_from.entity = v_to.entity then
    raise exception 'Use create_transfer for same-entity transfers';
  end if;

  if p_amount <= 0 then
    raise exception 'Transfer amount must be positive';
  end if;

  v_tx_from := _insert_transaction(
    v_from.user_id, p_from_account_id, 'transfer',
    -p_amount, null,
    p_description || ' -> ' || v_to.name || ' [' || v_to.entity || ']',
    v_from.entity, p_date, null, p_to_account_id
  );

  v_tx_to := _insert_transaction(
    v_to.user_id, p_to_account_id, 'transfer',
    p_amount, null,
    p_description || ' <- ' || v_from.name || ' [' || v_from.entity || ']',
    v_to.entity, p_date, null, p_from_account_id
  );

  perform _update_account_balance(p_from_account_id, -p_amount);
  perform _update_account_balance(p_to_account_id, p_amount);

  return jsonb_build_object(
    'from_transaction', to_jsonb(v_tx_from),
    'to_transaction', to_jsonb(v_tx_to),
    'from_entity', v_from.entity,
    'to_entity', v_to.entity,
    'amount', p_amount,
    'patrimony_impact', 0
  );
end;
$$ language plpgsql security definer;
