begin;
select plan(14);

-- ============================================================
-- Setup: two users, accounts, and a fixed month of transactions
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('b1000000-0000-0000-0000-000000000001', 'buckets-a@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000'),
  ('b1000000-0000-0000-0000-000000000002', 'buckets-b@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'Buckets Bank', 'asset', 'debit', 'personal'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
   'Buckets SpA Bank', 'asset', 'debit', 'spa'),
  ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002',
   'Other User Bank', 'asset', 'debit', 'personal');

-- User A, personal, March 2026
insert into transactions (user_id, account_id, type, amount, description, category, entity, date)
values
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'income', 1000000, 'Sueldo', 'ingreso.sueldo', 'personal', '2026-03-01'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'income', 200000, 'Transferencia recibida', null, 'personal', '2026-03-05'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 100000, 'Supermercado', 'necesidad.super', 'personal', '2026-03-06'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 400000, 'Arriendo', 'necesidad.arriendo', 'personal', '2026-03-06'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 80000, 'Restoran', 'consumo.comida', 'personal', '2026-03-10'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'refund', 30000, 'Devolucion restoran', 'consumo.comida', 'personal', '2026-03-12'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 40000, 'Compra sin categorizar', null, 'personal', '2026-03-15'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 10000, 'Prefijo desconocido', 'deuda.tc', 'personal', '2026-03-15'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'transfer', 480000, 'Ahorro Fintual', 'ahorro.inversion', 'personal', '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'transfer', 999999, 'Transferencia entre cuentas', null, 'personal', '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'adjustment', 123456, 'Apertura', 'apertura', 'personal', '2026-03-01'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'expense', 77777, 'Gasto de abril', 'consumo.comida', 'personal', '2026-04-02');

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
  1200000::bigint,
  'income sums all income of the month, categorized or not'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'necesidades')::bigint),
  500000::bigint,
  'necesidad% expenses land in necesidades'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'consumo')::bigint),
  50000::bigint,
  'refund subtracts from its bucket (80000 - 30000 = 50000)'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'ahorro')::bigint),
  480000::bigint,
  'transfer with ahorro% category counts in ahorro'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'por_categorizar')::bigint),
  50000::bigint,
  'NULL category and unknown prefix land in por_categorizar (40000 + 10000)'
);

select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'disponible')::bigint),
  50000::bigint,
  'disponible = income - (necesidades + consumo + ahorro + por_categorizar)'
);

select is(
  (select get_monthly_buckets('2026-03-15'::date)->>'month'),
  '2026-03',
  'month reflects the requested calendar month'
);

-- Totals across buckets prove exclusions: transfer without ahorro category,
-- adjustment, April expense, other user, and spa entity are all absent
select is(
  (select (get_monthly_buckets('2026-03-15'::date)->>'necesidades')::bigint
        + (get_monthly_buckets('2026-03-15'::date)->>'consumo')::bigint
        + (get_monthly_buckets('2026-03-15'::date)->>'ahorro')::bigint
        + (get_monthly_buckets('2026-03-15'::date)->>'por_categorizar')::bigint),
  1150000::bigint,
  'plain transfers, adjustments, other months, other users and spa are excluded'
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
