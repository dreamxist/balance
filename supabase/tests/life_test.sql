begin;
select plan(22);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('c1000000-0000-0000-0000-000000000001', 'life-a@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000'),
  ('c1000000-0000-0000-0000-000000000002', 'life-b@example.com',
   crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000');

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ============================================================
-- Habits: at most four active
-- ============================================================
insert into life_habits (name, emoji, position) values
  ('Dormir', '😴', 1), ('Levantarme', '⏰', 2), ('Alimentación', '🍽️', 3), ('Skincare', '🧴', 4);

select throws_ok(
  $$ insert into life_habits (name) values ('Leer') $$,
  '23514',
  'At most four active habits: archive one before adding another',
  'A fifth active habit is rejected'
);

update life_habits set is_archived = true where name = 'Skincare';
select lives_ok(
  $$ insert into life_habits (name) values ('Leer') $$,
  'Archiving one makes room for another'
);

select throws_ok(
  $$ update life_habits set is_archived = false where name = 'Skincare' $$,
  '23514',
  'At most four active habits: archive one before adding another',
  'Unarchiving past four is rejected too'
);

insert into life_habit_days (habit_id, day)
select id, date '2026-10-12' from life_habits where name = 'Dormir';
select is(
  (select count(*)::int from life_habit_days),
  1,
  'A habit day is recorded'
);

-- ============================================================
-- Routine and weeks
-- ============================================================
insert into life_sessions (id, vehicle, name, emoji) values
  ('c2000000-0000-0000-0000-000000000001', 'sport', 'Full Body A', '💪'),
  ('c2000000-0000-0000-0000-000000000002', 'sport', 'KUDO', '🥋');

insert into life_exercises (id, session_id, block, name, prescription, position, valid_from) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
   'A1', 'Press banca plana', '4 × 4-6', 1, '2026-09-01');

insert into life_routine_slots (weekday, vehicle, session_id, title, valid_from) values
  (1, 'sport', 'c2000000-0000-0000-0000-000000000002', 'KUDO', '2026-09-01'),
  (1, 'work', null, 'Planificar', '2026-09-01'),
  (4, 'sport', 'c2000000-0000-0000-0000-000000000001', 'Full Body A', '2026-09-01');

select is(
  (select week_start from life_open_week('2026-10-15')),
  date '2026-10-12',
  'A week opens on its Monday'
);

select is(
  (select count(*)::int from life_week_slots s join life_weeks w on w.id = s.week_id
   where w.week_start = '2026-10-12'),
  3,
  'A new week copies the typical week'
);

select is(
  (select day from life_week_slots where title = 'Full Body A'),
  date '2026-10-15',
  'Weekday 4 lands on Thursday'
);

update life_week_slots set title = 'KUDO examen' where title = 'KUDO';
select life_open_week('2026-10-12');
select is(
  (select count(*)::int from life_week_slots where title = 'KUDO examen'),
  1,
  'Reopening a week keeps its edits and copies nothing again'
);

select life_replace_exercise(
  'c3000000-0000-0000-0000-000000000001', 'Press banca inclinada', '4 × 4-6, RIR 2',
  null, 'Más hombro, el que trabaja en el gi', '2026-10-06'
);

select is(
  (select valid_to from life_exercises where id = 'c3000000-0000-0000-0000-000000000001'),
  date '2026-10-06',
  'Replacing an exercise closes the old version'
);

select is(
  (select name || ' · ' || change_note from life_exercises
   where session_id = 'c2000000-0000-0000-0000-000000000001' and valid_to is null),
  'Press banca inclinada · Más hombro, el que trabaja en el gi',
  'The new version carries the reason'
);

select life_replace_exercise(
  (select id from life_exercises where name = 'Press banca inclinada'),
  'Press banca inclinada', '4 × 5-6, RIR 2', null, null, '2026-10-06'
);
select is(
  (select count(*)::int from life_exercises),
  2,
  'A same-day change edits instead of adding a version'
);

select life_replace_slot(
  (select id from life_routine_slots where title = 'Full Body A'),
  'Full Body A', 'c2000000-0000-0000-0000-000000000001', '07:00', 'Al alba', '2026-10-19'
);
select life_open_week('2026-10-19');
select is(
  (select starts_at from life_week_slots s join life_weeks w on w.id = s.week_id
   where w.week_start = '2026-10-19' and s.title = 'Full Body A'),
  time '07:00',
  'A week opened after a slot change sees the new slot'
);
select is(
  (select starts_at from life_week_slots s join life_weeks w on w.id = s.week_id
   where w.week_start = '2026-10-12' and s.title = 'Full Body A'),
  null::time,
  'A week opened before the change keeps its own copy'
);

insert into life_week_notes (week_id, vehicle, body, wins, risks)
select id, 'sport', 'Dos KUDO', array['Volví al gym'], array['Dormí tarde'] from life_weeks
where week_start = '2026-10-12';
select is(
  (select wins[1] from life_week_notes where vehicle = 'sport'),
  'Volví al gym',
  'A week note per vehicle keeps wins and risks'
);

-- ============================================================
-- Objectives
-- ============================================================
insert into life_objectives (id, vehicle, title) values
  ('c4000000-0000-0000-0000-000000000001', 'sport', 'Cinturón morado');

select throws_ok(
  $$ insert into life_objective_steps (objective_id, title, status)
     values ('c4000000-0000-0000-0000-000000000001', 'Examen', 'done') $$,
  '23514',
  null,
  'A done step needs the date it was done'
);

select life_close_objective('c4000000-0000-0000-0000-000000000001', 'done', 'Examen aprobado', '2026-09-26');
select is(
  (select status::text || ' ' || closed_on::text from life_objectives),
  'done 2026-09-26',
  'Closing an objective records status and date'
);

select life_close_objective('c4000000-0000-0000-0000-000000000001', 'active');
select is(
  (select closed_on from life_objectives),
  null::date,
  'Reopening clears the close date'
);

insert into life_notes (vehicle, topic, body) values ('personal', 'relaciones', 'Almuerzo con la familia');

-- ============================================================
-- RLS: user B sees none of it and cannot write into A's rows
-- ============================================================
set local request.jwt.claims to '{"sub":"c1000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select (select count(*) from life_habits) + (select count(*) from life_weeks)
        + (select count(*) from life_week_slots) + (select count(*) from life_objectives)
        + (select count(*) from life_notes) + (select count(*) from life_exercises))::int,
  0,
  'Another user sees no life rows'
);

select throws_ok(
  $$ insert into life_exercises (session_id, name) values ('c2000000-0000-0000-0000-000000000001', 'Intruso') $$,
  '23503',
  null,
  'Another user cannot attach rows to a session that is not theirs'
);

select throws_ok(
  $$ select life_replace_exercise((select id from life_exercises limit 1), 'x') $$,
  'P0002',
  'Exercise not found or already replaced',
  'Another user cannot replace an exercise'
);

reset role;
delete from life_sessions where id = 'c2000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from life_week_slots where title = 'KUDO examen' and session_id is null),
  1,
  'Deleting a session keeps the week slots that used it'
);
delete from auth.users where id = 'c1000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from life_weeks where user_id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'Deleting a user removes their weeks'
);

select * from finish();
rollback;
