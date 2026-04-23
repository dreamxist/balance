-- Layer 2: Operations (compose primitives with business logic)

-- Create any account type with validation
create function create_account(
  p_name text,
  p_type account_type,
  p_subtype account_subtype,
  p_entity entity_type default 'personal',
  p_currency text default 'CLP',
  p_balance bigint default 0,
  p_credit_limit bigint default null,
  p_on_budget boolean default null
) returns accounts as $$
declare
  v_on_budget boolean;
  v_result accounts;
begin
  v_on_budget := coalesce(p_on_budget,
    case p_subtype
      when 'investment' then false
      when 'property' then false
      else true
    end
  );

  if p_type = 'asset' and p_subtype not in ('debit', 'cash', 'receivable', 'investment', 'property') then
    raise exception 'Invalid subtype "%" for asset account', p_subtype;
  end if;
  if p_type = 'liability' and p_subtype not in ('credit_card', 'payable') then
    raise exception 'Invalid subtype "%" for liability account', p_subtype;
  end if;

  insert into accounts (user_id, name, type, subtype, entity, currency, balance, credit_limit, on_budget)
  values ((select auth.uid()), p_name, p_type, p_subtype, p_entity, p_currency, p_balance, p_credit_limit, v_on_budget)
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql;

-- Atomic insert + balance update per D-01
create function create_transaction(
  p_amount bigint, p_category text,
  p_account_id uuid, p_description text,
  p_type transaction_type default null,
  p_date date default current_date
) returns jsonb as $$
declare
  v_account accounts;
  v_tx transactions;
begin
  select * into strict v_account from accounts where id = p_account_id;

  if p_type is null then
    p_type := case when p_amount >= 0 then 'income' else 'expense' end;
  end if;

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, p_type,
    p_amount, p_category, p_description,
    v_account.entity, p_date
  );

  perform _update_account_balance(p_account_id, p_amount);

  return to_jsonb(v_tx);
end;
$$ language plpgsql;

-- Register balance in accumulated WITHOUT moving it (Pitfall 1 prevention)
create function create_opening_balance(p_account_id uuid)
returns transactions as $$
declare
  v_account accounts;
  v_result transactions;
begin
  select * into strict v_account from accounts where id = p_account_id;

  v_result := _insert_transaction(
    v_account.user_id, p_account_id, 'adjustment',
    v_account.balance, null, 'Apertura: ' || v_account.name,
    v_account.entity, current_date
  );
  -- Does NOT call _update_account_balance
  -- Account already has correct balance from creation

  return v_result;
end;
$$ language plpgsql;

-- Create reversal adjustment per D-02 (never delete transactions)
create function undo_transaction(p_transaction_id uuid)
returns jsonb as $$
declare
  v_original transactions;
  v_reversal transactions;
begin
  select * into strict v_original
  from transactions
  where id = p_transaction_id
    and user_id = (select auth.uid());

  v_reversal := _insert_transaction(
    v_original.user_id, v_original.account_id, 'adjustment',
    -v_original.amount, v_original.category,
    'Undo: ' || v_original.description,
    v_original.entity, current_date,
    v_original.debt_id
  );

  perform _update_account_balance(v_original.account_id, -v_original.amount);

  return jsonb_build_object(
    'original', to_jsonb(v_original),
    'reversal', to_jsonb(v_reversal)
  );
end;
$$ language plpgsql;
