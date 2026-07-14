begin;
select plan(15);

-- ============================================================
-- Setup: two users
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('e1000000-0000-0000-0000-000000000001', 'ingest-a@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000'),
  ('e1000000-0000-0000-0000-000000000002', 'ingest-b@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000');

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ============================================================
-- email_movements: happy path + constraints
-- ============================================================
select lives_ok(
  $$insert into email_movements (user_id, gmail_message_id, source, amount, currency, merchant)
    values ('e1000000-0000-0000-0000-000000000001', 'gmail-msg-001', 'bancochile_tc', 9900, 'CLP', 'CRUNCHYROLL')$$,
  'owner can insert a pending email movement'
);

select is(
  (select status from email_movements where gmail_message_id = 'gmail-msg-001'),
  'pending',
  'status defaults to pending'
);

select throws_ok(
  $$insert into email_movements (user_id, gmail_message_id, source)
    values ('e1000000-0000-0000-0000-000000000001', 'gmail-msg-001', 'bancochile_tc')$$,
  '23505',
  null,
  'duplicate gmail_message_id is rejected'
);

select throws_ok(
  $$insert into email_movements (user_id, gmail_message_id, source)
    values ('e1000000-0000-0000-0000-000000000001', 'gmail-msg-002', 'banco_estado')$$,
  '23514',
  null,
  'unknown source is rejected'
);

select throws_ok(
  $$insert into email_movements (user_id, gmail_message_id, source, currency)
    values ('e1000000-0000-0000-0000-000000000001', 'gmail-msg-003', 'bancochile_tc', 'EUR')$$,
  '23514',
  null,
  'currency other than CLP/USD is rejected'
);

select throws_ok(
  $$update email_movements set status = 'bogus' where gmail_message_id = 'gmail-msg-001'$$,
  '23514',
  null,
  'invalid status is rejected'
);

-- ============================================================
-- categorization_rules: happy path + constraints
-- ============================================================
select lives_ok(
  $$insert into categorization_rules (user_id, pattern, category, priority)
    values ('e1000000-0000-0000-0000-000000000001', 'CRUNCHYROLL', 'consumo.entretencion', 10)$$,
  'owner can insert a categorization rule'
);

select throws_ok(
  $$insert into categorization_rules (user_id, pattern, category)
    values ('e1000000-0000-0000-0000-000000000001', 'NETFLIX', 'no.existe')$$,
  '23503',
  null,
  'rule with nonexistent category is rejected'
);

select throws_ok(
  $$insert into categorization_rules (user_id, pattern, category)
    values ('e1000000-0000-0000-0000-000000000001', '   ', 'consumo.entretencion')$$,
  '23514',
  null,
  'blank pattern is rejected'
);

-- ============================================================
-- RLS: user B is blind to user A rows and cannot write as A
-- ============================================================
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::bigint from email_movements),
  0::bigint,
  'other user sees no email movements'
);

select is(
  (select count(*)::bigint from categorization_rules),
  0::bigint,
  'other user sees no categorization rules'
);

select throws_ok(
  $$insert into email_movements (user_id, gmail_message_id, source)
    values ('e1000000-0000-0000-0000-000000000001', 'gmail-msg-004', 'bancochile_tc')$$,
  '42501',
  null,
  'user B cannot insert email movements as user A'
);

select throws_ok(
  $$insert into categorization_rules (user_id, pattern, category)
    values ('e1000000-0000-0000-0000-000000000001', 'DISNEY', 'consumo.entretencion')$$,
  '42501',
  null,
  'user B cannot insert rules as user A'
);

-- ============================================================
-- Structure: RLS enabled + partial pending index
-- ============================================================
reset role;

select ok(
  (select relrowsecurity from pg_class where relname = 'email_movements')
  and (select relrowsecurity from pg_class where relname = 'categorization_rules'),
  'RLS enabled on both tables'
);

select ok(
  exists (
    select 1 from pg_indexes
    where tablename = 'email_movements'
      and indexname = 'idx_email_movements_pending'
      and indexdef like '%WHERE%pending%'
  ),
  'partial index on pending status exists'
);

select * from finish();
rollback;
