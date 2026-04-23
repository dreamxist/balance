-- Layer 1: Primitives (single responsibility, no business rules)

-- Insert a transaction row. Does NOT update account balance.
create function _insert_transaction(
  p_user_id uuid, p_account_id uuid, p_type transaction_type,
  p_amount bigint, p_category text, p_description text,
  p_entity entity_type, p_date date,
  p_debt_id uuid default null, p_transfer_to uuid default null
) returns transactions as $$
  insert into transactions (user_id, account_id, type, amount, category, description, entity, date, debt_id, transfer_to)
  values (p_user_id, p_account_id, p_type, p_amount, p_category, p_description, p_entity, p_date, p_debt_id, p_transfer_to)
  returning *;
$$ language sql;

-- Update account balance by delta. Returns updated account.
create function _update_account_balance(
  p_account_id uuid, p_delta bigint
) returns accounts as $$
  update accounts
  set balance = balance + p_delta, updated_at = now()
  where id = p_account_id
  returning *;
$$ language sql;
