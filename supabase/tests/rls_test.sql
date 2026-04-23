begin;
select plan(4);

-- ============================================================
-- Setup: two users
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('aaaa0000-0000-0000-0000-000000000001', 'user1@test.com', crypt('pw', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbb0000-0000-0000-0000-000000000002', 'user2@test.com', crypt('pw', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- User 1 creates an account
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa0000-0000-0000-0000-000000000001","role":"authenticated"}';

select create_account('User1 Bank', 'asset', 'debit', 'personal', 'CLP', 100000, null, null);

-- ============================================================
-- Test 1: User 1 can see their own account
-- ============================================================
select is(
  (select count(*)::int from accounts where name = 'User1 Bank'),
  1,
  'User 1 sees their own account'
);

-- ============================================================
-- Test 2: User 2 cannot see User 1's account
-- ============================================================
set local request.jwt.claims to '{"sub":"bbbb0000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from accounts where name = 'User1 Bank'),
  0,
  'User 2 cannot see User 1 account (RLS enforced)'
);

-- ============================================================
-- Test 3: Anon role cannot see any accounts
-- ============================================================
set local role anon;

select is(
  (select count(*)::int from accounts),
  0,
  'Anon role cannot see any accounts (deny by default)'
);

-- ============================================================
-- Test 4: User 2 sees shared categories but not User 1's custom ones
-- ============================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa0000-0000-0000-0000-000000000001","role":"authenticated"}';

-- User 1 creates a custom subcategory
select create_subcategory('necesidad', 'necesidad.custom1', 'Mi Custom');

-- User 2 should see shared categories but NOT user1's custom one
set local request.jwt.claims to '{"sub":"bbbb0000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from categories where id = 'necesidad.custom1'),
  0,
  'User 2 cannot see User 1 custom category'
);

select * from finish();
rollback;
