begin;
select plan(5);

-- ============================================================
-- Setup: create test user and accounts
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values (
  'e1b2c3d4-0000-0000-0000-000000000001',
  'transfer-test@example.com',
  crypt('password', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1b2c3d4-0000-0000-0000-000000000001","role":"authenticated"}';

-- Create two personal accounts and one SPA account
select create_account('Bank A', 'asset', 'debit', 'personal', 'CLP', 500000, null, null);
select create_account('Bank B', 'asset', 'debit', 'personal', 'CLP', 200000, null, null);
select create_account('SPA Bank', 'asset', 'debit', 'spa', 'CLP', 300000, null, null);

-- Create opening balances so delta = 0
select create_opening_balance((select id from accounts where name = 'Bank A'));
select create_opening_balance((select id from accounts where name = 'Bank B'));
select create_opening_balance((select id from accounts where name = 'SPA Bank'));

-- ============================================================
-- Test 1: create_transfer updates both balances atomically
-- ============================================================
select ok(
  (select (create_transfer(
    (select id from accounts where name = 'Bank A'),
    (select id from accounts where name = 'Bank B'),
    100000, 'Test transfer', current_date
  ))::jsonb ? 'amount'),
  'create_transfer returns jsonb with amount'
);

select is(
  (select balance from accounts where name = 'Bank A'),
  400000::bigint,
  'Source balance decreased by transfer amount (500000 - 100000 = 400000)'
);

select is(
  (select balance from accounts where name = 'Bank B'),
  300000::bigint,
  'Destination balance increased by transfer amount (200000 + 100000 = 300000)'
);

-- ============================================================
-- Test 2: transfer type excluded from accumulated (delta unchanged)
-- ============================================================
select is(
  (select (get_reconciliation_status()->>'delta')::bigint),
  0::bigint,
  'Delta remains 0 after transfer (excluded from accumulated)'
);

-- ============================================================
-- Test 3: create_inter_entity_transfer rejects same-entity accounts
-- ============================================================
select throws_ok(
  format(
    'select create_inter_entity_transfer(%L, %L, 50000, ''Bad transfer'', current_date)',
    (select id from accounts where name = 'Bank A'),
    (select id from accounts where name = 'Bank B')
  ),
  'Use create_transfer for same-entity transfers',
  'inter_entity_transfer rejects same-entity accounts'
);

select * from finish();
rollback;
