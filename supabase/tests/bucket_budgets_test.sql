begin;
select plan(8);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('d1000000-0000-0000-0000-000000000001', 'budget-a@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000'),
  ('d1000000-0000-0000-0000-000000000002', 'budget-b@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity, on_budget)
values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'Budget Bank', 'asset', 'debit', 'personal', true);

insert into transactions (user_id, account_id, type, amount, description, category, entity, date)
values
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
   'income', 1550000, 'Sueldo', 'ingreso.sueldo', 'personal', '2026-03-01'),
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
   'expense', 100000, 'Super', 'necesidad.super', 'personal', '2026-03-02'),
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
   'expense', 50000, 'Restoran', 'consumo.comida', 'personal', '2026-03-02'),
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
   'expense', 30000, 'Cine', 'consumo.entretencion', 'personal', '2026-03-09'),
  ('d1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001',
   'refund', 10000, 'Devolución', 'consumo.comida', 'personal', '2026-03-10');

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into bucket_budgets (bucket, month, amount) values
  ('consumo', '2026-01-01', 725000),
  ('consumo', '2026-04-01', 550000),
  ('necesidades', '2026-03-01', 500000);

select is(
  (get_bucket_budgets('2026-03-15') -> 'buckets' -> 1 ->> 'budget')::bigint,
  725000::bigint,
  'A budget carries forward from the last month that set it'
);

select is(
  (get_bucket_budgets('2026-03-15') -> 'buckets' -> 1 ->> 'spent')::bigint,
  70000::bigint,
  'Spent nets refunds'
);

select is(
  (get_bucket_budgets('2026-03-15') -> 'buckets' -> 1 ->> 'remaining')::bigint,
  655000::bigint,
  'Remaining is budget minus spent'
);

select is(
  get_bucket_budgets('2026-03-15') -> 'buckets' -> 1 -> 'daily',
  '[{"date":"2026-03-02","spent":50000},{"date":"2026-03-09","spent":80000},{"date":"2026-03-10","spent":70000}]'::jsonb,
  'The daily series is cumulative'
);

select is(
  get_bucket_budgets('2026-03-15') -> 'buckets' -> 2 -> 'budget',
  'null'::jsonb,
  'A bucket without a budget says so'
);

select is(
  (get_bucket_budgets('2026-04-15') -> 'buckets' -> 1 ->> 'budget')::bigint,
  550000::bigint,
  'A later month takes the newer budget'
);

select is(
  (get_monthly_buckets('2026-03-15') ->> 'consumo')::bigint,
  70000::bigint,
  'get_monthly_buckets reads the same movements'
);

set local request.jwt.claims to '{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from bucket_budgets),
  0,
  'Another user sees no budgets'
);

select * from finish();
rollback;
