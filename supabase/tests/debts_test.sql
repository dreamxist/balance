begin;
select plan(8);

-- ============================================================
-- Setup: create test user and set auth context
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values (
  'd1b2c3d4-0000-0000-0000-000000000001',
  'debt-test@example.com',
  crypt('password', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1b2c3d4-0000-0000-0000-000000000001","role":"authenticated"}';

-- Create a credit card account for debt tests
select create_account('Test TC', 'liability', 'credit_card', 'personal', 'CLP', 0, 1000000, null);

-- ============================================================
-- Test 1: create_installment_purchase creates expense + debt
-- ============================================================
select ok(
  (select (create_installment_purchase(
    -100000, 3, 'necesidad.compras',
    (select id from accounts where name = 'Test TC'),
    'Compra test',
    current_date,
    (current_date + interval '1 month')::date
  ))::jsonb ? 'debt'),
  'create_installment_purchase returns jsonb with debt'
);

-- ============================================================
-- Test 2: Rounding -- 100000 / 3 installments
-- installment_amount = 33333, last = 100000 - 33333*2 = 33334
-- ============================================================
select is(
  (select installment_amount from debts where description = 'Compra test'),
  33333::bigint,
  'Installment amount = 33333 (floor of 100000/3)'
);

select is(
  (select last_installment_amount from debts where description = 'Compra test'),
  33334::bigint,
  'Last installment absorbs remainder = 33334'
);

-- ============================================================
-- Test 3: pay_debt_installment records debt_payment, advances counter
-- ============================================================
select ok(
  (select (pay_debt_installment(
    (select id from debts where description = 'Compra test'),
    current_date
  ))::jsonb ? 'remaining'),
  'pay_debt_installment returns jsonb with remaining'
);

select is(
  (select installments_paid from debts where description = 'Compra test'),
  1,
  'installments_paid advanced to 1 after first payment'
);

-- ============================================================
-- Test 4: debt_payment NOT included in accumulated
-- ============================================================
select is(
  (select (get_reconciliation_status()->>'delta')::bigint),
  0::bigint,
  'Delta is 0 -- debt_payment excluded from accumulated'
);

-- ============================================================
-- Test 5: pay_off_debt marks debt as paid
-- ============================================================
-- Create another debt to test payoff
select create_installment_purchase(
  -60000, 6, 'necesidad.compras',
  (select id from accounts where name = 'Test TC'),
  'Compra payoff test',
  current_date, null
);

select ok(
  (select (pay_off_debt(
    (select id from debts where description = 'Compra payoff test'),
    null
  ))::jsonb->>'status' = 'paid'),
  'pay_off_debt marks debt as paid'
);

-- ============================================================
-- Test 6: archive_account fails with active debts
-- ============================================================
select throws_ok(
  format(
    'select archive_account(%L)',
    (select id from accounts where name = 'Test TC')
  ),
  'Cannot archive account with active debts. Pay off or archive debts first.',
  'archive_account rejects account with active debts'
);

select * from finish();
rollback;
