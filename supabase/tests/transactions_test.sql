begin;
select plan(12);

-- ============================================================
-- Setup: create test user and set auth context
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'test@example.com',
  crypt('password', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1b2c3d4-0000-0000-0000-000000000001","role":"authenticated"}';

-- ============================================================
-- Test 1: create_account creates a debit account
-- ============================================================
select ok(
  (select (create_account('Test Bank', 'asset', 'debit', 'personal', 'CLP', 500000, null, null))::text is not null),
  'create_account returns a result for debit account'
);

-- ============================================================
-- Test 2: create_opening_balance registers in accumulated without moving balance
-- ============================================================
select ok(
  (select (create_opening_balance(
    (select id from accounts where name = 'Test Bank')
  ))::text is not null),
  'create_opening_balance returns transaction'
);

-- Verify balance unchanged after opening balance
select is(
  (select balance from accounts where name = 'Test Bank'),
  500000::bigint,
  'Balance unchanged after opening balance (500000)'
);

-- ============================================================
-- Test 3: Reconciliation after opening balance shows delta = 0
-- ============================================================
select is(
  (select (get_reconciliation_status()->>'delta')::bigint),
  0::bigint,
  'Delta is 0 after opening balance'
);

-- ============================================================
-- Test 4: create_transaction (expense) updates balance atomically
-- ============================================================
select ok(
  (select (create_transaction(
    -30000, 'necesidad.bencina',
    (select id from accounts where name = 'Test Bank'),
    'Bencina'
  ))::jsonb ? 'id'),
  'create_transaction returns jsonb with id'
);

select is(
  (select balance from accounts where name = 'Test Bank'),
  470000::bigint,
  'Account balance updated after expense (500000 - 30000 = 470000)'
);

-- ============================================================
-- Test 5: Reconciliation after expense shows delta = 0
-- ============================================================
select is(
  (select (get_reconciliation_status()->>'delta')::bigint),
  0::bigint,
  'Delta is 0 after expense (both position and accumulated decreased by 30000)'
);

-- ============================================================
-- Test 6: create_transaction auto-detects type
-- ============================================================
select is(
  (select (create_transaction(
    100000, 'ingreso.sueldo',
    (select id from accounts where name = 'Test Bank'),
    'Sueldo'
  ))::jsonb->>'type'),
  'income',
  'Positive amount auto-detects as income'
);

-- ============================================================
-- Test 7: undo_transaction creates reversal
-- ============================================================
select ok(
  (select (undo_transaction(
    (select id from transactions where description = 'Bencina' limit 1)
  ))::jsonb ? 'reversal'),
  'undo_transaction returns jsonb with reversal'
);

-- Balance: 500000 - 30000 (expense) + 100000 (income) + 30000 (undo) = 600000
select is(
  (select balance from accounts where name = 'Test Bank'),
  600000::bigint,
  'Balance correct after undo (500000 - 30000 + 100000 + 30000 = 600000)'
);

-- ============================================================
-- Test 8: Transactions are immutable (no UPDATE policy exists)
-- ============================================================
select is(
  (select count(*)::bigint from pg_policies
    where tablename = 'transactions' and cmd = 'UPDATE'),
  0::bigint,
  'No UPDATE policy on transactions (immutable via RLS)'
);

-- ============================================================
-- Test 9: Audit log has entries from our operations
-- ============================================================
-- Switch to postgres to read audit_log (regular user cannot due to RLS)
reset role;
select ok(
  (select count(*) > 0 from audit_log where table_name = 'accounts'),
  'Audit log has entries for accounts changes'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1b2c3d4-0000-0000-0000-000000000001","role":"authenticated"}';

select * from finish();
rollback;
