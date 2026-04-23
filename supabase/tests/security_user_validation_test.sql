-- =============================================================================
-- security_user_validation_test.sql
-- Verifies the cross-user isolation contract enforced by
-- migrations/20260422235333_security_patch_function_user_validation.sql
--
-- For each hardened RPC: User B (authed) must not be able to operate on
-- User A's account/debt/invoice. Calls must raise SQLSTATE '42501'
-- (insufficient_privilege). User A operating on their OWN data must succeed.
-- =============================================================================

begin;
select plan(15);

-- ============================================================
-- Setup: two users, one account each
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('aaaa1111-0000-0000-0000-000000000001', 'usera@test.com', crypt('pw', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbb2222-0000-0000-0000-000000000002', 'userb@test.com', crypt('pw', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- User A: a debit account + a credit card + a receivable
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}';

select create_account('A Bank',     'asset',     'debit',       'personal', 'CLP', 1000000, null, null);
select create_account('A CC',       'liability', 'credit_card', 'personal', 'CLP', 0,       500000, null);
select create_account('A Receiv',   'asset',     'receivable',  'personal', 'CLP', 50000,   null, null);

-- User A also creates an installment debt on A CC so we have a debt id to attack.
select create_installment_purchase(
  120000, 4, 'gasto.test',
  (select id from accounts where name = 'A CC'),
  'A Test Purchase'
);

-- User B: a single account
set local request.jwt.claims to '{"sub":"bbbb2222-0000-0000-0000-000000000002","role":"authenticated"}';
select create_account('B Bank',     'asset',     'debit',       'personal', 'CLP', 1000000, null, null);

-- Capture useful ids (postgres role bypasses RLS)
reset role;
\set ON_ERROR_STOP on

-- We cannot use \set in a function body; instead embed the lookups inline.

-- ============================================================
-- All "must fail" tests run as User B
-- ============================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbb2222-0000-0000-0000-000000000002","role":"authenticated"}';

-- Test 1: User B cannot create_transaction on A's account
select throws_ok(
  $$ select create_transaction(
       -1000, 'necesidad.test',
       (select id from accounts a
          where a.name = 'A Bank'
            and a.user_id = 'aaaa1111-0000-0000-0000-000000000001'
          limit 1),
       'B attacking A'
     ) $$,
  '42501',
  null,
  'create_transaction rejects cross-user account_id'
);

-- Test 2: User B cannot create_opening_balance on A's account
select throws_ok(
  $$ select create_opening_balance(
       (select id from accounts a
          where a.name = 'A Bank'
            and a.user_id = 'aaaa1111-0000-0000-0000-000000000001'
          limit 1)
     ) $$,
  '42501',
  null,
  'create_opening_balance rejects cross-user account_id'
);

-- Test 3: User B cannot create_installment_purchase on A's credit card
select throws_ok(
  $$ select create_installment_purchase(
       50000, 3, 'gasto.test',
       (select id from accounts a
          where a.name = 'A CC'
            and a.user_id = 'aaaa1111-0000-0000-0000-000000000001'
          limit 1),
       'B attacking A CC'
     ) $$,
  '42501',
  null,
  'create_installment_purchase rejects cross-user account_id'
);

-- Test 4: User B cannot pay_debt_installment on A's debt
select throws_ok(
  $$ select pay_debt_installment(
       (select id from debts d
          where d.user_id = 'aaaa1111-0000-0000-0000-000000000001'
          limit 1)
     ) $$,
  '42501',
  null,
  'pay_debt_installment rejects cross-user debt_id'
);

-- Test 5: User B cannot pay_off_debt on A's debt
select throws_ok(
  $$ select pay_off_debt(
       (select id from debts d
          where d.user_id = 'aaaa1111-0000-0000-0000-000000000001'
          limit 1)
     ) $$,
  '42501',
  null,
  'pay_off_debt rejects cross-user debt_id'
);

-- Test 6: User B cannot _advance_debt_payment on A's debt (defense in depth)
select throws_ok(
  $$ select _advance_debt_payment(
       (select id from debts d
          where d.user_id = 'aaaa1111-0000-0000-0000-000000000001'
          limit 1)
     ) $$,
  '42501',
  null,
  '_advance_debt_payment rejects cross-user debt_id'
);

-- Test 7: User B cannot create_transfer FROM A's account into B's account
select throws_ok(
  $$ select create_transfer(
       (select id from accounts where name = 'A Bank'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       (select id from accounts where name = 'B Bank'
          and user_id = 'bbbb2222-0000-0000-0000-000000000002' limit 1),
       1000, 'siphon'
     ) $$,
  '42501',
  null,
  'create_transfer rejects cross-user source account'
);

-- Test 8: User B cannot create_transfer INTO A's account from B's account
select throws_ok(
  $$ select create_transfer(
       (select id from accounts where name = 'B Bank'
          and user_id = 'bbbb2222-0000-0000-0000-000000000002' limit 1),
       (select id from accounts where name = 'A Bank'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       1000, 'gift'
     ) $$,
  '42501',
  null,
  'create_transfer rejects cross-user destination account'
);

-- Test 9: User B cannot receive_payment on A's receivable
select throws_ok(
  $$ select receive_payment(
       (select id from accounts where name = 'A Receiv'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       (select id from accounts where name = 'B Bank'
          and user_id = 'bbbb2222-0000-0000-0000-000000000002' limit 1),
       1000, 'theft'
     ) $$,
  '42501',
  null,
  'receive_payment rejects cross-user receivable'
);

-- Test 10: User B cannot create_spa_invoice with create_transaction targeting A's account
select throws_ok(
  $$ select create_spa_invoice(
       'emitida'::invoice_direction,
       'AcmeCorp',
       100000,
       'factura_afecta'::document_type,
       'B attacking A via SpA',
       null,
       current_date,
       (select id from accounts where name = 'A Bank'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       true
     ) $$,
  '42501',
  null,
  'create_spa_invoice rejects cross-user account_id when creating tx'
);

-- ============================================================
-- Positive control: User A can operate on their own resources
-- ============================================================
set local request.jwt.claims to '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}';

-- Test 11: User A can create_transaction on their own account
select lives_ok(
  $$ select create_transaction(
       -5000, 'necesidad.test',
       (select id from accounts where name = 'A Bank'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       'A legitimate'
     ) $$,
  'create_transaction succeeds for owner'
);

-- Test 12: User A can create_transfer between their own accounts
-- (A Bank -> A Receiv; just to use two existing A accounts)
select lives_ok(
  $$ select create_transfer(
       (select id from accounts where name = 'A Bank'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       (select id from accounts where name = 'A Receiv'
          and user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1),
       100, 'A internal'
     ) $$,
  'create_transfer succeeds when both accounts owned by caller'
);

-- Test 13: User A can pay_debt_installment on their own debt
select lives_ok(
  $$ select pay_debt_installment(
       (select id from debts where user_id = 'aaaa1111-0000-0000-0000-000000000001' limit 1)
     ) $$,
  'pay_debt_installment succeeds for debt owner'
);

-- Test 14: User A balance was actually moved by their own create_transaction
select is(
  (select balance from accounts where name = 'A Bank'
     and user_id = 'aaaa1111-0000-0000-0000-000000000001'),
  (1000000 - 5000 - 100)::bigint,   -- expense + outbound transfer
  'A Bank balance reflects A''s own legitimate operations'
);

-- Test 15: User B's account untouched by all the failed attacks above
select is(
  (select balance from accounts where name = 'B Bank'
     and user_id = 'bbbb2222-0000-0000-0000-000000000002'),
  1000000::bigint,
  'B Bank balance unchanged after attempted attacks'
);

select * from finish();
rollback;
