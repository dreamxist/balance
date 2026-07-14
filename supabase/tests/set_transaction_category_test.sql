begin;
select plan(11);

-- ============================================================
-- Setup: two users, one account and one uncategorized expense for A
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('f1000000-0000-0000-0000-000000000001', 'setcat-a@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000'),
  ('f1000000-0000-0000-0000-000000000002', 'setcat-b@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
        'SetCat Bank', 'asset', 'debit');

insert into transactions (id, user_id, account_id, type, amount, description, category, entity, date)
values ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
        'f2000000-0000-0000-0000-000000000001', 'expense', 33333, 'Sin categoria', null, 'personal', current_date);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ============================================================
-- Happy path: owner sets category, only category changes
-- ============================================================
select is(
  (select set_transaction_category('f3000000-0000-0000-0000-000000000001', 'consumo.comida')->>'category'),
  'consumo.comida',
  'owner can set category on their transaction'
);

select is(
  (select category from transactions where id = 'f3000000-0000-0000-0000-000000000001'),
  'consumo.comida',
  'category is persisted'
);

select is(
  (select amount from transactions where id = 'f3000000-0000-0000-0000-000000000001'),
  33333::bigint,
  'amount is untouched'
);

-- Recategorize again (fixing a wrong assignment is allowed)
select is(
  (select set_transaction_category('f3000000-0000-0000-0000-000000000001', 'necesidad.super')->>'category'),
  'necesidad.super',
  'category can be corrected afterwards'
);

-- ============================================================
-- Validations
-- ============================================================
select throws_ok(
  $$select set_transaction_category('f3000000-0000-0000-0000-000000000001', 'no.existe')$$,
  'P0001',
  null,
  'nonexistent category fails'
);

select throws_ok(
  $$select set_transaction_category('f3000000-0000-0000-0000-000000000001', null)$$,
  'P0001',
  null,
  'null category fails'
);

select throws_ok(
  $$select set_transaction_category('f3000000-0000-0000-0000-000000000099', 'consumo.comida')$$,
  '42501',
  null,
  'nonexistent transaction fails closed'
);

-- ============================================================
-- Ownership: user B cannot touch A's transaction
-- ============================================================
set local request.jwt.claims to '{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select set_transaction_category('f3000000-0000-0000-0000-000000000001', 'consumo.comida')$$,
  '42501',
  null,
  'other user cannot recategorize the transaction'
);

select is(
  (select count(*)::bigint from transactions),
  0::bigint,
  'user B still sees no foreign transactions (RLS intact)'
);

-- ============================================================
-- Audit: the recategorization is logged
-- ============================================================
reset role;

select is(
  (select count(*)::bigint from audit_log
    where table_name = 'transactions'
      and record_id = 'f3000000-0000-0000-0000-000000000001'
      and operation = 'UPDATE'),
  2::bigint,
  'each recategorization writes an UPDATE audit entry'
);

select is(
  (select new_row->>'category' from audit_log
    where table_name = 'transactions'
      and record_id = 'f3000000-0000-0000-0000-000000000001'
      and operation = 'UPDATE'
    order by id desc limit 1),
  'necesidad.super',
  'audit entry captures the new category'
);

select * from finish();
rollback;
