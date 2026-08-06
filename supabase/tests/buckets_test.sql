begin;
select plan(17);

-- ============================================================
-- Setup: two users, accounts (incl. off-budget), fixed month
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('b1000000-0000-0000-0000-000000000001', 'buckets-a@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000'),
  ('b1000000-0000-0000-0000-000000000002', 'buckets-b@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity, on_budget)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'Buckets Bank', 'asset', 'debit', 'personal', true),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
   'Buckets SpA Bank', 'asset', 'debit', 'spa', true),
  ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002',
   'Other User Bank', 'asset', 'debit', 'personal', true),
  ('b2000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001',
   'Buckets Fintual', 'asset', 'investment', 'personal', false);

-- User A, personal, March 2026
insert into transactions (user_id, account_id, type, amount, description, category, entity, date)
values
  -- income: sueldo + uncategorized transfer-in = 1.200.000; the 'Undo:' income
  -- reversal (-100.000) nets it down to 1.100.000; the ahorro-rooted income
  -- (90.000) is a deposit, not earnings, and never counts.
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'income', 1000000, 'Sueldo', 'ingreso.sueldo', 'personal', '2026-03-01'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'income', 200000, 'Transferencia recibida', null, 'personal', '2026-03-05'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'adjustment', -100000, 'Undo: Ingreso duplicado', 'ingreso.sueldo', 'personal', '2026-03-05'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'income', 90000, 'Deposito a cuenta ahorro', 'ahorro.inversion', 'personal', '2026-03-07'),
  -- necesidades: 100.000 + 400.000 + legacy 'supermercado' 15.000 = 515.000
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 100000, 'Supermercado', 'necesidad.super', 'personal', '2026-03-06'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 400000, 'Arriendo', 'necesidad.arriendo', 'personal', '2026-03-06'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 15000, 'Feria', 'supermercado', 'personal', '2026-03-06'),
  -- consumo: 80.000 - refund 30.000 + 25.000 - its undo 25.000 = 50.000
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 80000, 'Restoran', 'consumo.comida', 'personal', '2026-03-10'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'refund', 30000, 'Devolucion restoran', 'consumo.comida', 'personal', '2026-03-12'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 25000, 'Cine', 'consumo.entretencion', 'personal', '2026-03-13'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'adjustment', 25000, 'Undo: Cine', 'consumo.entretencion', 'personal', '2026-03-13'),
  -- ahorro: recorded as an expense with an ahorro-rooted category, 480.000
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 480000, 'Ahorro marzo - Fintual', 'ahorro', 'personal', '2026-03-20'),
  -- por_categorizar: NULL 40.000 + unknown prefix 10.000 = 50.000
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 40000, 'Compra sin categorizar', null, 'personal', '2026-03-15'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 10000, 'Prefijo desconocido', 'deuda.tc', 'personal', '2026-03-15'),
  -- exclusions: non-flow categories, transfers (even ahorro-tagged pairs),
  -- non-undo adjustments, other months
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 20000, 'Pago tarjeta', 'pago-tarjeta', 'personal', '2026-03-18'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'transfer', -480000, 'Ahorro -> Fintual', 'ahorro.inversion', 'personal', '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000004',
   'transfer', 480000, 'Ahorro <- Buckets Bank', 'ahorro.inversion', 'personal', '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'transfer', 999999, 'Transferencia entre cuentas', null, 'personal', '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'adjustment', 123456, 'Apertura', 'apertura', 'personal', '2026-03-01'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'adjustment', 77000, 'Cuadre de saldos', 'Otro ingreso', 'personal', '2026-03-02'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 77777, 'Gasto de abril', 'consumo.comida', 'personal', '2026-04-02'),
  -- off-budget account: never counts
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000004',
   'expense', 33333, 'Gasto en cuenta off-budget', 'consumo.comida', 'personal', '2026-03-21');

-- User A, spa, March 2026
insert into transactions (user_id, account_id, type, amount, description, category, entity, date)
values
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002',
   'income', 500000, 'Factura pagada', null, 'spa', '2026-03-08'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002',
   'expense', 60000, 'Gasto SpA', null, 'spa', '2026-03-09');

-- User B, personal, March 2026 (must never leak into user A results)
insert into transactions (user_id, account_id, type, amount, description, category, entity, date)
values
  ('b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000003',
   'expense', 88888, 'Gasto de otro usuario', 'consumo.comida', 'personal', '2026-03-10');

set local role authenticated;
set local request.jwt.claims to '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ============================================================
-- Personal buckets for March 2026
-- ============================================================
select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'income')::bigint),
  1100000::bigint,
  'income = sueldo + uncategorized income - undo reversal; ahorro-rooted income excluded'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'necesidades')::bigint),
  515000::bigint,
  'necesidad% expenses plus legacy supermercado land in necesidades'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'consumo')::bigint),
  50000::bigint,
  'refund subtracts and Undo: reversal nets its expense back out (80-30+25-25)'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'ahorro')::bigint),
  480000::bigint,
  'expense with ahorro-rooted category counts in ahorro'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'por_categorizar')::bigint),
  50000::bigint,
  'NULL category and unknown prefix land in por_categorizar (40000 + 10000)'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'disponible')::bigint),
  485000::bigint,
  'disponible = income - (necesidades + consumo + por_categorizar); ahorro not subtracted'
);

select is(
  (select get_monthly_buckets('2026-03-15'::date)->>'month'),
  '2026-03',
  'month reflects the requested calendar month'
);

-- Totals across buckets prove exclusions: non-flow pago-tarjeta, ALL transfers
-- (including the ahorro.inversion pair), non-undo adjustments, off-budget
-- account, April expense, other user, and spa entity are absent
select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'necesidades')::bigint
        + (get_monthly_buckets('2026-03-15'::date)->>'consumo')::bigint
        + (get_monthly_buckets('2026-03-15'::date)->>'ahorro')::bigint
        + (get_monthly_buckets('2026-03-15'::date)->>'por_categorizar')::bigint),
  1095000::bigint,
  'non-flow, transfers, plain adjustments, off-budget, other months/users/entity excluded'
);

-- The ahorro transfer pair specifically must contribute nothing (it used to
-- cancel to 0 inside the bucket, hiding real savings; now it is simply out)
select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'ahorro')::bigint),
  (select sum(amount) from transactions
    where user_id = 'b1000000-0000-0000-0000-000000000001'
      and type = 'expense' and lower(category) like 'ahorro%'
      and date between '2026-03-01' and '2026-03-31')::bigint,
  'ahorro equals its expense rows exactly: transfer legs contribute nothing'
);

-- ============================================================
-- Entity spa
-- ============================================================
select is(
  (select (get_monthly_buckets('2026-03-15'::date, 'spa')->>'income')::bigint),
  500000::bigint,
  'p_entity = spa returns spa income'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date, 'spa')->>'por_categorizar')::bigint),
  60000::bigint,
  'spa expense without category lands in spa por_categorizar'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date, 'spa')->>'disponible')::bigint),
  440000::bigint,
  'spa disponible computed independently from personal'
);

-- ============================================================
-- Empty month returns zeros
-- ============================================================
select is(
  (select get_monthly_buckets('2020-01-15'::date)
     - 'month'),
  '{"income": 0, "necesidades": 0, "consumo": 0, "ahorro": 0, "por_categorizar": 0, "disponible": 0}'::jsonb,
  'empty month returns all zeros'
);

-- ============================================================
-- Legacy category roots resolve as documented
-- ============================================================
select is(_bucket_root('necesidad.salud'), 'necesidad', 'tree ids resolve by head');
select is(_bucket_root('Otro ingreso'), 'ingreso', 'legacy Otro ingreso maps to ingreso');

-- ============================================================
-- RLS: user B only sees their own numbers
-- ============================================================
set local request.jwt.claims to '{"sub":"b1000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'consumo')::bigint),
  88888::bigint,
  'user B sees only their own consumo'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'income')::bigint),
  0::bigint,
  'user B sees none of user A income'
);

select * from finish();
rollback;
