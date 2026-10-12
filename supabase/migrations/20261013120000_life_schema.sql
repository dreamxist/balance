-- Life planning: the structured half of the user's life framework, read and
-- edited by the Quark iOS app and by agents through `bal life`.
--
-- - Three vehicles: sport (body), work (mind), personal (soul). Personal is
--   never measured: notes and facts, no scores.
-- - Habits: the cross-cutting routines that hold everything up. At most four
--   active ones ("if one is added, another goes"). Days are marked, streaks are
--   never computed.
-- - Routine: sessions (KUDO, Full Body A...) with their exercises, and a typical
--   week of slots. Both are versioned with valid_from/valid_to, so changing an
--   exercise closes the old row and keeps why it changed.
-- - Weeks: each week opens as a copy of the typical week and is edited freely;
--   one note per vehicle says how the week is going.
-- - Objectives: roadmap steps (done / current / pending / paused) with dates,
--   and a status that records when and how it was finished or dropped.

create type life_vehicle as enum ('sport', 'work', 'personal');
create type life_objective_status as enum ('active', 'done', 'dropped');
create type life_step_status as enum ('done', 'current', 'pending', 'paused');

create function life_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- Habits
-- ============================================================
create table life_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emoji text,
  position smallint not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create function life_habits_max_four()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.is_archived and (
    select count(*) from life_habits h
    where h.user_id = new.user_id and not h.is_archived and h.id <> new.id
  ) >= 4 then
    raise exception 'At most four active habits: archive one before adding another'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger life_habits_max_four
  before insert or update of is_archived on life_habits
  for each row execute function life_habits_max_four();

create trigger life_habits_touch
  before update on life_habits
  for each row execute function life_touch_updated_at();

create table life_habit_days (
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  day date not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (habit_id, day),
  foreign key (habit_id, user_id) references life_habits(id, user_id) on delete cascade
);

create index idx_life_habit_days_user_day on life_habit_days(user_id, day);

-- ============================================================
-- Routine: sessions, exercises, typical week
-- ============================================================
create table life_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle life_vehicle not null,
  name text not null check (length(trim(name)) > 0),
  emoji text,
  focus text,
  position smallint not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create trigger life_sessions_touch
  before update on life_sessions
  for each row execute function life_touch_updated_at();

create table life_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null default auth.uid(),
  block text,
  name text not null check (length(trim(name)) > 0),
  prescription text,
  purpose text,
  position smallint not null default 0,
  valid_from date not null default current_date,
  valid_to date,
  change_note text,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  foreign key (session_id, user_id) references life_sessions(id, user_id) on delete cascade
);

create index idx_life_exercises_session on life_exercises(session_id, position) where valid_to is null;

create table life_routine_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  vehicle life_vehicle not null,
  session_id uuid,
  title text not null check (length(trim(title)) > 0),
  starts_at time,
  position smallint not null default 0,
  valid_from date not null default current_date,
  valid_to date,
  change_note text,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  foreign key (session_id, user_id) references life_sessions(id, user_id) on delete set null (session_id)
);

create index idx_life_routine_slots_user on life_routine_slots(user_id, weekday) where valid_to is null;

-- ============================================================
-- Weeks
-- ============================================================
create table life_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  unique (id, user_id)
);

create trigger life_weeks_touch
  before update on life_weeks
  for each row execute function life_touch_updated_at();

create table life_week_slots (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null,
  user_id uuid not null default auth.uid(),
  day date not null,
  vehicle life_vehicle not null,
  session_id uuid,
  title text not null check (length(trim(title)) > 0),
  starts_at time,
  position smallint not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (week_id, user_id) references life_weeks(id, user_id) on delete cascade,
  foreign key (session_id, user_id) references life_sessions(id, user_id) on delete set null (session_id)
);

create index idx_life_week_slots_week on life_week_slots(week_id, day, position);

create trigger life_week_slots_touch
  before update on life_week_slots
  for each row execute function life_touch_updated_at();

create table life_week_notes (
  week_id uuid not null,
  user_id uuid not null default auth.uid(),
  vehicle life_vehicle not null,
  body text,
  wins text[] not null default '{}',
  risks text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (week_id, vehicle),
  foreign key (week_id, user_id) references life_weeks(id, user_id) on delete cascade
);

create trigger life_week_notes_touch
  before update on life_week_notes
  for each row execute function life_touch_updated_at();

-- ============================================================
-- Objectives
-- ============================================================
create table life_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle life_vehicle not null,
  title text not null check (length(trim(title)) > 0),
  year smallint not null default extract(year from current_date)::smallint,
  focus text,
  status life_objective_status not null default 'active',
  status_note text,
  closed_on date,
  linear_project_id text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active') = (closed_on is null)),
  unique (id, user_id)
);

create trigger life_objectives_touch
  before update on life_objectives
  for each row execute function life_touch_updated_at();

create table life_objective_steps (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null,
  user_id uuid not null default auth.uid(),
  position smallint not null default 0,
  title text not null check (length(trim(title)) > 0),
  period text,
  status life_step_status not null default 'pending',
  started_on date,
  done_on date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (done_on is not null)),
  foreign key (objective_id, user_id) references life_objectives(id, user_id) on delete cascade
);

create index idx_life_objective_steps_objective on life_objective_steps(objective_id, position);

create trigger life_objective_steps_touch
  before update on life_objective_steps
  for each row execute function life_touch_updated_at();

-- ============================================================
-- Notes: follow-up per vehicle, never a number
-- ============================================================
create table life_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle life_vehicle not null,
  topic text,
  body text not null check (length(trim(body)) > 0),
  noted_on date not null default current_date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_life_notes_user on life_notes(user_id, vehicle, noted_on desc) where not is_archived;

create trigger life_notes_touch
  before update on life_notes
  for each row execute function life_touch_updated_at();

-- ============================================================
-- RLS: every row belongs to its user
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'life_habits', 'life_habit_days', 'life_sessions', 'life_exercises',
    'life_routine_slots', 'life_weeks', 'life_week_slots', 'life_week_notes',
    'life_objectives', 'life_objective_steps', 'life_notes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_select', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check ((select auth.uid()) = user_id)',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete to authenticated using ((select auth.uid()) = user_id)',
      t || '_delete', t);
  end loop;
end;
$$;

-- ============================================================
-- Operations
-- ============================================================

-- Opens the week that contains p_day. A new week starts as a copy of the
-- typical week valid on its Monday; an existing one is returned untouched.
create function life_open_week(p_day date default null)
returns life_weeks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_start date := date_trunc('week', coalesce(p_day, current_date))::date;
  v_week life_weeks;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into life_weeks (user_id, week_start)
  values (v_user, v_start)
  on conflict (user_id, week_start) do nothing
  returning * into v_week;

  if v_week.id is null then
    select * into strict v_week
    from life_weeks where user_id = v_user and week_start = v_start;
    return v_week;
  end if;

  insert into life_week_slots (week_id, user_id, day, vehicle, session_id, title, starts_at, position)
  select v_week.id, v_user, v_start + (s.weekday - 1), s.vehicle, s.session_id, s.title, s.starts_at, s.position
  from life_routine_slots s
  where s.user_id = v_user
    and s.valid_from <= v_start
    and (s.valid_to is null or s.valid_to > v_start);

  return v_week;
end;
$$;

-- Changes an exercise of the routine from p_from on. The old version is
-- closed and kept with the reason; a change on the day it was created just
-- edits it.
create function life_replace_exercise(
  p_exercise_id uuid,
  p_name text,
  p_prescription text default null,
  p_purpose text default null,
  p_note text default null,
  p_from date default null
)
returns life_exercises
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, current_date);
  v_old life_exercises;
  v_new life_exercises;
begin
  select * into v_old
  from life_exercises
  where id = p_exercise_id and user_id = (select auth.uid()) and valid_to is null
  for update;

  if v_old.id is null then
    raise exception 'Exercise not found or already replaced' using errcode = 'P0002';
  end if;

  if v_old.valid_from >= v_from then
    update life_exercises
    set name = p_name, prescription = p_prescription, purpose = p_purpose,
        change_note = coalesce(p_note, change_note)
    where id = v_old.id
    returning * into v_new;
    return v_new;
  end if;

  update life_exercises set valid_to = v_from where id = v_old.id;

  insert into life_exercises (session_id, user_id, block, name, prescription, purpose, position, valid_from, change_note)
  values (v_old.session_id, v_old.user_id, v_old.block, p_name, p_prescription, p_purpose, v_old.position, v_from, p_note)
  returning * into v_new;

  return v_new;
end;
$$;

-- Same rule for a slot of the typical week. Weeks already opened keep their
-- own copy; only weeks opened later see the change.
create function life_replace_slot(
  p_slot_id uuid,
  p_title text,
  p_session_id uuid default null,
  p_starts_at time default null,
  p_note text default null,
  p_from date default null
)
returns life_routine_slots
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, current_date);
  v_old life_routine_slots;
  v_new life_routine_slots;
begin
  select * into v_old
  from life_routine_slots
  where id = p_slot_id and user_id = (select auth.uid()) and valid_to is null
  for update;

  if v_old.id is null then
    raise exception 'Slot not found or already replaced' using errcode = 'P0002';
  end if;

  if v_old.valid_from >= v_from then
    update life_routine_slots
    set title = p_title, session_id = p_session_id, starts_at = p_starts_at,
        change_note = coalesce(p_note, change_note)
    where id = v_old.id
    returning * into v_new;
    return v_new;
  end if;

  update life_routine_slots set valid_to = v_from where id = v_old.id;

  insert into life_routine_slots (user_id, weekday, vehicle, session_id, title, starts_at, position, valid_from, change_note)
  values (v_old.user_id, v_old.weekday, v_old.vehicle, p_session_id, p_title, p_starts_at, v_old.position, v_from, p_note)
  returning * into v_new;

  return v_new;
end;
$$;

-- Closes an objective as done or dropped, with the date and how it ended.
create function life_close_objective(
  p_objective_id uuid,
  p_status life_objective_status,
  p_note text default null,
  p_on date default null
)
returns life_objectives
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_objective life_objectives;
begin
  if p_status = 'active' then
    update life_objectives
    set status = 'active', closed_on = null, status_note = coalesce(p_note, status_note)
    where id = p_objective_id and user_id = (select auth.uid())
    returning * into v_objective;
  else
    update life_objectives
    set status = p_status, closed_on = coalesce(p_on, current_date), status_note = p_note
    where id = p_objective_id and user_id = (select auth.uid())
    returning * into v_objective;
  end if;

  if v_objective.id is null then
    raise exception 'Objective not found' using errcode = 'P0002';
  end if;

  return v_objective;
end;
$$;

revoke all on function life_open_week(date) from public, anon;
revoke all on function life_replace_exercise(uuid, text, text, text, text, date) from public, anon;
revoke all on function life_replace_slot(uuid, text, uuid, time, text, date) from public, anon;
revoke all on function life_close_objective(uuid, life_objective_status, text, date) from public, anon;
grant execute on function life_open_week(date) to authenticated;
grant execute on function life_replace_exercise(uuid, text, text, text, text, date) to authenticated;
grant execute on function life_replace_slot(uuid, text, uuid, time, text, date) to authenticated;
grant execute on function life_close_objective(uuid, life_objective_status, text, date) to authenticated;

grant select, insert, update, delete on
  life_habits, life_habit_days, life_sessions, life_exercises, life_routine_slots,
  life_weeks, life_week_slots, life_week_notes, life_objectives, life_objective_steps, life_notes
to authenticated;
