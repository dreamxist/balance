begin;
select plan(5);

-- ============================================================
-- Setup: create test user and accounts
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values (
  'f1b2c3d4-0000-0000-0000-000000000001',
  'snapshot-test@example.com',
  crypt('password', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f1b2c3d4-0000-0000-0000-000000000001","role":"authenticated"}';

-- Create on-budget and off-budget accounts
select create_account('On Budget Bank', 'asset', 'debit', 'personal', 'CLP', 500000, null, true);
select create_account('Off Budget Invest', 'asset', 'investment', 'personal', 'CLP', 1000000, null, false);

-- Create opening balances
select create_opening_balance((select id from accounts where name = 'On Budget Bank'));

-- ============================================================
-- Test 1: create_snapshot captures financial state
-- ============================================================
select ok(
  (select (create_snapshot('2025-01-15'))::jsonb ? 'id'),
  'create_snapshot returns jsonb with id'
);

-- ============================================================
-- Test 2: Unique constraint prevents duplicate snapshots on same date
-- ============================================================
select throws_ok(
  $$select create_snapshot('2025-01-15')$$,
  'Snapshot for date 2025-01-15 already exists',
  'Cannot create two snapshots for same date'
);

-- ============================================================
-- Test 3: Off-budget excluded from position but included in net_worth
-- ============================================================
select is(
  (select (create_snapshot('2025-01-16'))::jsonb->>'position'),
  '500000',
  'Position only includes on-budget accounts (500000)'
);

select is(
  (select net_worth from snapshots where date = '2025-01-16'
    and user_id = 'f1b2c3d4-0000-0000-0000-000000000001'::uuid),
  1500000::bigint,
  'Net worth includes all accounts (500000 + 1000000 = 1500000)'
);

-- ============================================================
-- Test 4: Snapshot status = balanced when delta = 0
-- ============================================================
select is(
  (select status from snapshots where date = '2025-01-16'
    and user_id = 'f1b2c3d4-0000-0000-0000-000000000001'::uuid),
  'balanced'::snapshot_status,
  'Snapshot status is balanced when delta = 0'
);

select * from finish();
rollback;
