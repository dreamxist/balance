-- Fix archive_account to check for active debts before archiving
-- Completes Phase 2 TODO from 00012_account_operations.sql

create or replace function archive_account(p_account_id uuid)
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

  if exists (select 1 from debts where account_id = p_account_id and status = 'active') then
    raise exception 'Cannot archive account with active debts. Pay off or archive debts first.';
  end if;

  update accounts
  set is_archived = true, updated_at = now()
  where id = p_account_id
    and user_id = (select auth.uid())
  returning * into v_account;

  return v_account;
end;
$$ language plpgsql security definer;
