-- =============================================================================
-- Security Patch: Function user_id validation
-- =============================================================================
-- Audit finding: Several PL/pgSQL functions accept account_id / debt_id /
-- receivable_id / invoice_id parameters and resolve the row WITHOUT verifying
-- that the row belongs to the calling user. The danger is amplified when
-- the function runs as `security definer`, which BYPASSES the RLS policies
-- on accounts/debts/spa_invoices and lets any authenticated JWT operate on
-- another user's data (corrupt balances, register payments, exfiltrate
-- entity/category metadata, etc).
--
-- This migration replaces every affected function with a hardened version
-- that explicitly filters by `user_id = (select auth.uid())` (or, for cross
-- account checks, by `auth.uid()` against both sides) and raises a clear
-- exception when the lookup fails. Function signatures and return types are
-- preserved 1:1 so callers (web app + CLI) keep working.
--
-- Defense in depth: even functions that currently rely on RLS implicitly
-- (e.g. create_transaction is `language plpgsql` without security definer,
-- so accounts RLS does filter the SELECT) are patched. This protects against
-- a future migration accidentally adding `security definer` and silently
-- re-introducing the gap.
--
-- Functions hardened in this migration:
--   1. create_transaction                  (was 00030_audit_fixes.sql)
--   2. create_opening_balance              (was 00008_operations.sql)
--   3. create_installment_purchase         (was 00030_audit_fixes.sql, security definer)
--   4. pay_debt_installment                (was 00016_debt_operations.sql, security definer)
--   5. pay_off_debt                        (was 00030_audit_fixes.sql, security definer)
--   6. _advance_debt_payment               (was 00030_audit_fixes.sql, defense in depth)
--   7. create_transfer                     (was 00017_transfers.sql, security definer)
--   8. create_inter_entity_transfer        (was 00017_transfers.sql, security definer)
--   9. receive_payment                     (was 00018_receivables.sql, security definer)
--  10. mark_invoice_paid                   (was 00027_spa_invoices.sql, security definer)
--  11. create_spa_invoice                  (was 00027_spa_invoices.sql, security definer)
--  12. link_transaction_to_invoice         (was 00028_spa_invoice_linking.sql, security definer)
--
-- NOT changed (already validated, see report):
--   archive_account, rename_account, update_account_balance_manual,
--   undo_transaction, archive_debt, rename_category, delete_category,
--   complete_onboarding, create_snapshot, get_snapshot_history,
--   get_reconciliation_status, get_f29_summary, mark_f29_declared,
--   get_spa_annual_summary, create_subcategory (RLS-safe — see report).

-- =============================================================================
-- 1. create_transaction
-- =============================================================================
-- Change: account lookup now requires user_id = auth.uid().
-- Behavior on mismatch: raises 'Account not found or unauthorized' instead of
-- letting `SELECT INTO STRICT` fall through with NO_DATA_FOUND.

create or replace function create_transaction(
  p_amount bigint, p_category text,
  p_account_id uuid, p_description text,
  p_type transaction_type default null,
  p_date date default current_date
) returns jsonb as $$
declare
  v_account accounts;
  v_tx transactions;
  v_store_amount bigint;
  v_balance_delta bigint;
begin
  -- SECURITY: enforce ownership of the target account.
  select * into v_account from accounts
  where id = p_account_id
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Account not found or unauthorized'
      using errcode = '42501';
  end if;

  if p_type is null then
    p_type := case when p_amount >= 0 then 'income' else 'expense' end;
  end if;

  v_store_amount := abs(p_amount);
  v_balance_delta := case
    when p_type = 'income' then v_store_amount
    when p_type = 'refund' then v_store_amount
    when p_type = 'expense' then -v_store_amount
    when p_type = 'adjustment' then p_amount
    else p_amount
  end;

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, p_type,
    v_store_amount, p_category, p_description,
    v_account.entity, p_date
  );

  perform _update_account_balance(p_account_id, v_balance_delta);

  return to_jsonb(v_tx);
end;
$$ language plpgsql;

-- =============================================================================
-- 2. create_opening_balance
-- =============================================================================
create or replace function create_opening_balance(p_account_id uuid)
returns transactions as $$
declare
  v_account accounts;
  v_result transactions;
begin
  -- SECURITY: enforce ownership of the target account.
  select * into v_account from accounts
  where id = p_account_id
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Account not found or unauthorized'
      using errcode = '42501';
  end if;

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

-- =============================================================================
-- 3. create_installment_purchase
-- =============================================================================
-- Critical: this runs as security definer, so RLS does not protect the
-- account lookup at all. Without the user_id check, a logged-in user could
-- create an installment debt charged to ANY credit card in the database.

create or replace function create_installment_purchase(
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
  v_store_amount bigint;
begin
  -- SECURITY: enforce ownership of the target account.
  select * into v_account from accounts
  where id = p_account_id
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Account not found or unauthorized'
      using errcode = '42501';
  end if;

  if v_account.type <> 'liability' then
    raise exception
      'Compras en cuotas solo permitidas en cuentas de credito (liability). Cuenta % es tipo %.',
      v_account.name, v_account.type;
  end if;

  if p_amount <= 0 then
    raise exception 'Monto de compra debe ser positivo, recibido %', p_amount;
  end if;

  if p_installments < 1 then
    raise exception 'Numero de cuotas debe ser >= 1, recibido %', p_installments;
  end if;

  v_store_amount := abs(p_amount);

  v_debt := _create_debt(
    v_account.user_id, p_account_id, p_description,
    v_store_amount, p_installments, p_category, p_date, p_first_payment_date
  );

  v_tx := _insert_transaction(
    v_account.user_id, p_account_id, 'expense',
    v_store_amount, p_category,
    p_description || ' (' || p_installments || ' cuotas)',
    v_account.entity, p_date, v_debt.id
  );

  perform _update_account_balance(p_account_id, -v_store_amount);

  return jsonb_build_object(
    'debt', to_jsonb(v_debt),
    'transaction', to_jsonb(v_tx),
    'patrimony_impact', -v_store_amount,
    'installment_amount', v_debt.installment_amount,
    'last_installment_amount', v_debt.last_installment_amount
  );

exception
  when sqlstate '42501' then
    raise;
  when others then
    insert into error_log (function_name, error_message, error_detail, context)
    values ('create_installment_purchase', SQLERRM, SQLSTATE,
      jsonb_build_object('amount', p_amount, 'account', p_account_id));
    raise;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- 4. pay_debt_installment
-- =============================================================================
-- Critical: security definer. Previously selected the debt by id+status only,
-- letting any user record an installment payment against any other user's
-- debt. Now also requires user_id = auth.uid() on the debt.

create or replace function pay_debt_installment(
  p_debt_id uuid,
  p_date date default current_date
) returns jsonb as $$
declare
  v_debt debts;
  v_tx transactions;
  v_payment_amount bigint;
begin
  -- SECURITY: enforce ownership of the debt.
  select * into v_debt from debts
  where id = p_debt_id
    and status = 'active'
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Debt not found, not active, or unauthorized'
      using errcode = '42501';
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

-- =============================================================================
-- 5. pay_off_debt
-- =============================================================================
-- Critical: security definer. Adds user_id check on the debt lookup AND on
-- the account lookup that follows.

create or replace function pay_off_debt(
  p_debt_id uuid,
  p_actual_amount bigint default null
) returns jsonb as $$
declare
  v_debt debts;
  v_account accounts;
  v_remaining bigint;
  v_discount bigint;
  v_uid uuid;
begin
  v_uid := (select auth.uid());

  -- SECURITY: enforce ownership of the debt + lock for concurrent payoff.
  select * into v_debt from debts
  where id = p_debt_id
    and status = 'active'
    and user_id = v_uid
  for update;
  if not found then
    raise exception 'Debt not found, not active, or unauthorized'
      using errcode = '42501';
  end if;

  if p_actual_amount is not null then
    if p_actual_amount <= 0 then
      raise exception 'actual_amount debe ser positivo, recibido %', p_actual_amount;
    end if;
    if p_actual_amount > v_debt.remaining_amount then
      raise exception 'actual_amount (%) excede remaining (%)',
        p_actual_amount, v_debt.remaining_amount;
    end if;
  end if;

  -- SECURITY: defense in depth. The debt's account must also belong to the
  -- caller (this should always hold given debts.account_id FK + ownership
  -- of debt, but we re-check to keep the invariant explicit).
  select * into v_account from accounts
  where id = v_debt.account_id
    and user_id = v_uid;
  if not found then
    raise exception 'Account not found or unauthorized'
      using errcode = '42501';
  end if;

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

-- =============================================================================
-- 6. _advance_debt_payment (defense in depth)
-- =============================================================================
-- Primitive helper. Today it is only called from pay_debt_installment which
-- already validates ownership upstream, but if exposed via RPC any authed
-- JWT could advance another user's debt counters. Add the check.

create or replace function _advance_debt_payment(p_debt_id uuid)
returns debts as $$
declare
  v_debt debts;
  v_payment_amount bigint;
  v_result debts;
begin
  -- SECURITY: enforce ownership of the debt.
  select * into v_debt from debts
  where id = p_debt_id
    and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Debt not found or unauthorized'
      using errcode = '42501';
  end if;

  if v_debt.status <> 'active' then
    raise exception 'Cannot advance debt %: status is %', p_debt_id, v_debt.status;
  end if;

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

-- =============================================================================
-- 7. create_transfer (same-entity)
-- =============================================================================
-- Critical: security definer. Both sides of the transfer must belong to the
-- caller; otherwise a user could move money out of someone else's account
-- (or into one to artificially inflate it).

create or replace function create_transfer(
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
  v_uid uuid;
begin
  v_uid := (select auth.uid());

  -- SECURITY: both accounts must belong to the caller.
  select * into v_from from accounts
  where id = p_from_account_id and user_id = v_uid;
  if not found then
    raise exception 'Source account not found or unauthorized'
      using errcode = '42501';
  end if;

  select * into v_to from accounts
  where id = p_to_account_id and user_id = v_uid;
  if not found then
    raise exception 'Destination account not found or unauthorized'
      using errcode = '42501';
  end if;

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

-- =============================================================================
-- 8. create_inter_entity_transfer
-- =============================================================================
create or replace function create_inter_entity_transfer(
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
  v_uid uuid;
begin
  v_uid := (select auth.uid());

  -- SECURITY: both accounts must belong to the caller (inter-entity is still
  -- within a single user — both personal and SpA accounts share user_id).
  select * into v_from from accounts
  where id = p_from_account_id and user_id = v_uid;
  if not found then
    raise exception 'Source account not found or unauthorized'
      using errcode = '42501';
  end if;

  select * into v_to from accounts
  where id = p_to_account_id and user_id = v_uid;
  if not found then
    raise exception 'Destination account not found or unauthorized'
      using errcode = '42501';
  end if;

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

-- =============================================================================
-- 9. receive_payment
-- =============================================================================
-- Critical: security definer. Adds user_id check on the receivable account.
-- (Destination account ownership is enforced transitively by the now-hardened
-- create_transfer.)

create or replace function receive_payment(
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
  -- SECURITY: enforce ownership of the receivable account.
  select * into v_receivable from accounts
  where id = p_receivable_id
    and subtype = 'receivable'
    and not is_archived
    and user_id = (select auth.uid());
  if not found then
    raise exception 'Receivable not found or unauthorized'
      using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  if p_amount > v_receivable.balance then
    raise exception 'Payment amount (%) exceeds receivable balance (%)', p_amount, v_receivable.balance;
  end if;

  -- create_transfer is itself hardened to validate p_destination_id ownership.
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

-- =============================================================================
-- 10. mark_invoice_paid
-- =============================================================================
-- Already validates invoice ownership; now also validates account ownership
-- so a user cannot mark their invoice as "paid into" another user's account.

create or replace function mark_invoice_paid(
  p_invoice_id uuid,
  p_account_id uuid
) returns spa_invoices as $$
declare
  v_invoice spa_invoices;
  v_account accounts;
  v_tx jsonb;
  v_uid uuid;
begin
  v_uid := (select auth.uid());

  select * into strict v_invoice from spa_invoices
    where id = p_invoice_id and user_id = v_uid;

  -- SECURITY: enforce ownership of the destination account.
  select * into v_account from accounts
    where id = p_account_id and user_id = v_uid;
  if not found then
    raise exception 'Account not found or unauthorized'
      using errcode = '42501';
  end if;

  if v_invoice.direction != 'emitida' then
    raise exception 'Solo facturas emitidas pueden marcarse como pagadas';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Factura ya está pagada';
  end if;

  v_tx := create_transaction(
    v_invoice.total, 'Facturacion', p_account_id,
    'FAC ' || v_invoice.counterpart || ' | Neto: ' || v_invoice.neto ||
    ' | IVA: ' || v_invoice.iva || ' | Total: ' || v_invoice.total,
    'income', current_date
  );

  update spa_invoices
    set status = 'paid', transaction_id = (v_tx->>'id')::uuid
    where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- 11. create_spa_invoice
-- =============================================================================
-- When p_create_transaction is true with an account, validate the account
-- belongs to the caller before delegating to create_transaction. Avoids
-- leaking through the security-definer boundary.

create or replace function create_spa_invoice(
  p_direction       invoice_direction,
  p_counterpart     text,
  p_neto            bigint,
  p_doc_type        document_type default 'factura_afecta',
  p_description     text default '',
  p_folio_sii       text default null,
  p_date            date default current_date,
  p_account_id      uuid default null,
  p_create_transaction boolean default false
) returns spa_invoices as $$
declare
  v_iva bigint;
  v_total bigint;
  v_invoice spa_invoices;
  v_tx jsonb;
  v_uid uuid;
begin
  v_uid := (select auth.uid());

  -- SECURITY: if a side-effect transaction will be created, enforce that the
  -- destination account belongs to the caller BEFORE inserting any rows.
  if p_direction = 'emitida' and p_create_transaction and p_account_id is not null then
    if not exists (
      select 1 from accounts where id = p_account_id and user_id = v_uid
    ) then
      raise exception 'Account not found or unauthorized'
        using errcode = '42501';
    end if;
  end if;

  v_iva := case
    when p_doc_type in ('factura_afecta', 'boleta') then round(p_neto * 0.19)
    else 0
  end;
  v_total := p_neto + v_iva;

  insert into spa_invoices (
    user_id, direction, doc_type, counterpart, description,
    neto, iva, total, folio_sii, date, status, in_rcv
  ) values (
    v_uid, p_direction, p_doc_type, p_counterpart, p_description,
    p_neto, v_iva, v_total, p_folio_sii, p_date,
    case
      when p_direction = 'recibida' then 'paid'
      when p_create_transaction then 'paid'
      else 'draft'
    end,
    case when p_direction = 'recibida' then true else false end
  ) returning * into v_invoice;

  if p_direction = 'emitida' and p_create_transaction and p_account_id is not null then
    v_tx := create_transaction(
      v_total, 'Facturacion', p_account_id,
      'FAC ' || p_counterpart || ' | Neto: ' || p_neto || ' | IVA: ' || v_iva || ' | Total: ' || v_total,
      'income', p_date
    );
    update spa_invoices
      set transaction_id = (v_tx->>'id')::uuid
      where id = v_invoice.id;
    v_invoice.transaction_id := (v_tx->>'id')::uuid;
  end if;

  return v_invoice;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- 12. link_transaction_to_invoice
-- =============================================================================
-- Already validates transaction ownership via the WHERE on the UPDATE.
-- Now also validates the invoice belongs to the caller, otherwise a user
-- could attach their transaction to another user's invoice id (which would
-- then leak via the `spa_reimbursables` view).

create or replace function link_transaction_to_invoice(
  p_transaction_id uuid,
  p_invoice_id uuid,
  p_reimbursable boolean default true
) returns transactions as $$
declare
  v_tx transactions;
  v_uid uuid;
begin
  v_uid := (select auth.uid());

  -- SECURITY: invoice (when supplied) must belong to the caller.
  if p_invoice_id is not null then
    if not exists (
      select 1 from spa_invoices where id = p_invoice_id and user_id = v_uid
    ) then
      raise exception 'Invoice not found or unauthorized'
        using errcode = '42501';
    end if;
  end if;

  update transactions
    set linked_invoice_id = p_invoice_id,
        reimbursable = p_reimbursable
    where id = p_transaction_id
      and user_id = v_uid
  returning * into v_tx;

  if not found then
    raise exception 'Transaction not found or unauthorized'
      using errcode = '42501';
  end if;

  return v_tx;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- Documented test cases (see supabase/tests/security_user_validation_test.sql)
-- =============================================================================
-- Two-user isolation contract enforced by this patch:
--   * User A creates an account A1 and a debt D1 against A1.
--   * User B creates an account B1.
--   * Authenticated as User B, every cross-user RPC must raise SQLSTATE
--     '42501' (insufficient_privilege) instead of touching A's data:
--       - create_transaction(amount, cat, A1, ...)            -> raises
--       - create_opening_balance(A1)                          -> raises
--       - create_installment_purchase(amount, n, cat, A1, ..) -> raises
--       - pay_debt_installment(D1)                            -> raises
--       - pay_off_debt(D1)                                    -> raises
--       - _advance_debt_payment(D1)                           -> raises
--       - create_transfer(A1, B1, ...) and (B1, A1, ...)      -> both raise
--       - create_inter_entity_transfer(...) (analogous)       -> raises
--       - receive_payment(A1_receivable, B1, ...)             -> raises
--       - mark_invoice_paid(B_invoice, A1)                    -> raises
--       - create_spa_invoice(... p_account_id=A1, p_create_transaction=true) -> raises
--       - link_transaction_to_invoice(B_tx, A_invoice)        -> raises
--   * Authenticated as User A, the same calls succeed against A1/D1, proving
--     no regression for legitimate use.
