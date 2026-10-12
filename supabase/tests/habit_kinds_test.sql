begin;
select plan(5);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('e1000000-0000-0000-0000-000000000001', 'kinds@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into life_habits (id, name, kind, target) values
  ('e2000000-0000-0000-0000-000000000001', 'Dormir 7 h', 'sleep', 7),
  ('e2000000-0000-0000-0000-000000000002', 'Sin carbo en la noche', 'manual', null);

select is(
  (select kind from life_habits where name = 'Sin carbo en la noche'),
  'manual',
  'Habits are manual unless said otherwise'
);

select throws_ok(
  $$ insert into life_habits (name, kind) values ('Pasos', 'steps') $$,
  '23514', null,
  'A measured habit needs its target'
);

select throws_ok(
  $$ insert into life_habits (name, target) values ('Leer', 3) $$,
  '23514', null,
  'A manual habit has no target'
);

select throws_ok(
  $$ insert into life_habit_days (habit_id, day) values ('e2000000-0000-0000-0000-000000000001', '2026-10-12') $$,
  '23514',
  'This habit is measured by Apple Health on the phone; it is not marked by hand',
  'Measured habits are not marked by hand'
);

select lives_ok(
  $$ insert into life_habit_days (habit_id, day) values ('e2000000-0000-0000-0000-000000000002', '2026-10-12') $$,
  'Manual habits are marked by hand'
);

select * from finish();
rollback;
