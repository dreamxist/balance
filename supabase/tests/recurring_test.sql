-- =============================================================================
-- recurring_test.sql
-- Verifies the recurring-charges catch-up engine added in
-- migrations/20260627120000_recurring_auto_manual_catchup.sql
--
-- Contracts under test:
--   * Dual-path auth: cron (service_role, auth.uid()=NULL) must pass p_user_id;
--     a JWT user can only ever act on themselves; anon cannot execute at all.
--   * Catch-up: charges due on/before as_of (this month) get registered, with a
--     metadata link to the recurring charge.
--   * Dedup: a second run never double-charges.
--   * auto vs manual: auto-only by default; manual paid via pay_recurring_charge.
--   * Clamp: day_of_month past the month end clamps to the last day.
-- =============================================================================

begin;
select plan(17);

-- ============================================================
-- Setup: two users; A has charges, B has none
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('aaaa1111-0000-0000-0000-000000000001', 'usera@test.com', crypt('pw', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbb2222-0000-0000-0000-000000000002', 'userb@test.com', crypt('pw', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- User A: a debit account
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}';
select create_account('A Bank', 'asset', 'debit', 'personal', 'CLP', 1000000, null, null);

-- User A: explicit-id charges so we can reference them regardless of RLS.
insert into recurring_charges (id, user_id, name, amount, currency, day_of_month, category, account_id, is_active, auto_charge)
values
  ('c1c1c1c1-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001', 'A Auto Charge',   10000, 'CLP',  5, 'necesidad.suscripciones', (select id from accounts where name = 'A Bank'), true, true),
  ('c2c2c2c2-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-000000000001', 'A Manual Charge', 20000, 'CLP', 10, 'necesidad.servicios',     (select id from accounts where name = 'A Bank'), true, false),
  ('c3c3c3c3-0000-0000-0000-000000000003', 'aaaa1111-0000-0000-0000-000000000001', 'A EndOfMonth',      5000, 'CLP', 31, 'necesidad.suscripciones', (select id from accounts where name = 'A Bank'), true, true);

-- User B: a single account, no charges
set local request.jwt.claims to '{"sub":"bbbb2222-0000-0000-0000-000000000002","role":"authenticated"}';
select create_account('B Bank', 'asset', 'debit', 'personal', 'CLP', 1000000, null, null);

-- ============================================================
-- Phase 1 — cron path (service_role, auth.uid() = NULL)
-- ============================================================
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';

-- Test 1: cron must pass p_user_id explicitly
select throws_ok(
  $$ select process_due_recurring_charges('2026-06-15'::date, false, null, false) $$,
  '22023',
  null,
  'process_due_recurring_charges requires p_user_id when auth.uid() is null'
);

-- Test 2: dry-run does not insert anything
select lives_ok(
  $$ select process_due_recurring_charges('2026-06-15'::date, false, 'aaaa1111-0000-0000-0000-000000000001', true) $$,
  'dry-run runs without error'
);
select is(
  (select count(*)::int from transactions where metadata ? 'recurring_charge_id'),
  0,
  'dry-run creates no recurring-linked transactions'
);

-- Test 3: real catch-up run for A (auto only, mid-June)
select lives_ok(
  $$ select process_due_recurring_charges('2026-06-15'::date, false, 'aaaa1111-0000-0000-0000-000000000001', false) $$,
  'cron run for A succeeds'
);

-- Only the day-5 auto charge is due+auto. Day-10 is manual (excluded); day-31
-- clamps to Jun 30 which is after as_of (not due).
select is(
  (select count(*)::int from transactions where metadata ? 'recurring_charge_id'),
  1,
  'cron registers exactly the one due auto charge'
);
select is(
  (select (metadata->>'recurring_charge_id') from transactions where metadata ? 'recurring_charge_id' limit 1),
  'c1c1c1c1-0000-0000-0000-000000000001',
  'the registered transaction links back to the auto charge'
);
select is(
  (select balance from accounts where name = 'A Bank'),
  (1000000 - 10000)::bigint,
  'A Bank balance reflects the auto charge'
);

-- Test 4: dedup — a second run does not double-charge
select lives_ok(
  $$ select process_due_recurring_charges('2026-06-15'::date, false, 'aaaa1111-0000-0000-0000-000000000001', false) $$,
  'second cron run succeeds (idempotent)'
);
select is(
  (select count(*)::int from transactions where metadata ? 'recurring_charge_id'),
  1,
  'second run does not create a duplicate'
);

-- ============================================================
-- Phase 2 — user isolation (User B)
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbb2222-0000-0000-0000-000000000002","role":"authenticated"}';

-- Test 5: B passing A's p_user_id is forced back to B (processes nothing for A)
select lives_ok(
  $$ select process_due_recurring_charges('2026-06-15'::date, false, 'aaaa1111-0000-0000-0000-000000000001', false) $$,
  'B calling with A''s p_user_id is silently scoped to B'
);

-- Test 6: B cannot pay A's manual charge
select throws_ok(
  $$ select pay_recurring_charge('c2c2c2c2-0000-0000-0000-000000000002'::uuid) $$,
  '42501',
  null,
  'pay_recurring_charge rejects cross-user charge'
);

-- ============================================================
-- Phase 3 — owner (User A)
-- ============================================================
set local request.jwt.claims to '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}';

-- Test 7: A's account was untouched by B's attempts above
select is(
  (select balance from accounts where name = 'A Bank'),
  (1000000 - 10000)::bigint,
  'A Bank balance unchanged after B''s cross-user attempts'
);

-- Test 8: A pays their own manual charge
select lives_ok(
  $$ select pay_recurring_charge('c2c2c2c2-0000-0000-0000-000000000002'::uuid, '2026-06-15'::date) $$,
  'owner can pay their manual charge'
);
select is(
  (select balance from accounts where name = 'A Bank'),
  (1000000 - 10000 - 20000)::bigint,
  'A Bank balance reflects the manual payment'
);

-- Test 9: get_recurring_status marks the auto charge as charged
select is(
  (select elem->>'status'
     from jsonb_array_elements(get_recurring_status('2026-06-15'::date)) elem
     where elem->>'name' = 'A Auto Charge'),
  'charged',
  'get_recurring_status reports the auto charge as charged'
);

-- Test 10: day-of-month clamp — day 31 in February resolves to the 28th
select is(
  (select elem->>'due_date'
     from jsonb_array_elements(get_recurring_status('2026-02-15'::date)) elem
     where elem->>'name' = 'A EndOfMonth'),
  '2026-02-28',
  'day_of_month 31 clamps to the last day of February'
);

-- ============================================================
-- Phase 4 — grant lockdown: anon must not be able to execute the cron RPC
-- ============================================================
-- Assert the grant via has_function_privilege rather than calling as anon: the
-- local postgres image SEGFAULTS on the "permission denied for function" path
-- (real Postgres raises a clean 42501). The grant is the security control we
-- need to verify, and this checks it deterministically.
reset role;

-- Test 11: anon has NO execute on the cron RPC (so it cannot spoof p_user_id)
select is(
  has_function_privilege('anon', 'process_due_recurring_charges(date, boolean, uuid, boolean, entity_type)', 'execute'),
  false,
  'anon cannot execute process_due_recurring_charges'
);

select * from finish();
rollback;
