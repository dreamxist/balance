-- Account management operations (Layer 2: Operations)
-- archive_account, rename_account, update_account_balance_manual

-- ACCT-08: Archive account (soft delete, never hard delete)
-- Debt check is a placeholder — debts table created in Phase 3
-- Phase 3 will ALTER this function to add the actual debt check
create function archive_account(p_account_id uuid)
returns accounts as $$
declare
  v_account accounts;
begin
  select * into strict v_account from accounts
  where id = p_account_id
    and user_id = (select auth.uid());

  if v_account.is_archived then
    raise exception 'Account is already archived';
  end if;

  -- TODO Phase 3: Add debt check here
  -- if exists (select 1 from debts where account_id = p_account_id and status = 'active') then
  --   raise exception 'Cannot archive account with active debts';
  -- end if;

  update accounts
  set is_archived = true, updated_at = now()
  where id = p_account_id
    and user_id = (select auth.uid())
  returning * into v_account;

  return v_account;
end;
$$ language plpgsql security definer;

-- ACCT-09, ACCT-11: Rename account with unique name enforcement
-- unique_user_account_name constraint (from 00004) handles uniqueness automatically
-- If duplicate name, PostgreSQL raises unique_violation which supabase-js returns as error
create function rename_account(
  p_account_id uuid,
  p_new_name text
) returns accounts as $$
declare
  v_result accounts;
begin
  if p_new_name is null or length(trim(p_new_name)) = 0 then
    raise exception 'Account name cannot be empty';
  end if;

  update accounts
  set name = trim(p_new_name), updated_at = now()
  where id = p_account_id
    and user_id = (select auth.uid())
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- ACCT-10, RECON-03: Inline balance edit creates adjustment transaction for the difference
-- After update, delta recalculates automatically (reconciliation view reads current balances)
create function update_account_balance_manual(
  p_account_id uuid,
  p_new_balance bigint
) returns jsonb as $$
declare
  v_account accounts;
  v_delta bigint;
  v_tx transactions;
begin
  select * into strict v_account from accounts
  where id = p_account_id
    and user_id = (select auth.uid());

  v_delta := p_new_balance - v_account.balance;

  if v_delta = 0 then
    return jsonb_build_object('account', to_jsonb(v_account), 'adjustment', null);
  end if;

  -- Create adjustment transaction for the difference
  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, 'adjustment',
    v_delta, null, 'Balance manual: ' || v_account.name,
    v_account.entity, current_date
  );

  -- Update the account balance directly
  perform _update_account_balance(p_account_id, v_delta);

  -- Refresh account
  select * into v_account from accounts where id = p_account_id;

  return jsonb_build_object(
    'account', to_jsonb(v_account),
    'adjustment', to_jsonb(v_tx)
  );
end;
$$ language plpgsql security definer;
