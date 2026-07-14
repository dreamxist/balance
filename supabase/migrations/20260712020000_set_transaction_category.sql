-- set_transaction_category: the ONLY permitted mutation on transactions.
-- Transactions stay immutable for amount/type/date/account (no UPDATE RLS
-- policy); recategorization runs as security definer, validates ownership and
-- category visibility, updates ONLY category, and writes its own audit_log
-- entry (the audit trigger on transactions is insert-only by design).

create function set_transaction_category(
  p_transaction_id uuid,
  p_category text
) returns jsonb as $$
declare
  v_uid uuid := (select auth.uid());
  v_old transactions;
  v_new transactions;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_old from transactions
  where id = p_transaction_id and user_id = v_uid;
  if not found then
    raise exception 'Transaction % not found or not owned by caller', p_transaction_id
      using errcode = '42501';
  end if;

  if p_category is null then
    raise exception 'Category is required';
  end if;

  if not exists (
    select 1 from categories
    where id = p_category and (user_id is null or user_id = v_uid)
  ) then
    raise exception 'Category "%" does not exist', p_category;
  end if;

  update transactions set category = p_category
  where id = p_transaction_id
  returning * into v_new;

  insert into audit_log (table_name, record_id, operation, old_row, new_row, user_id)
  values ('transactions', p_transaction_id::text, 'UPDATE',
          to_jsonb(v_old), to_jsonb(v_new), v_uid);

  return to_jsonb(v_new);
end;
$$ language plpgsql security definer set search_path = public;
