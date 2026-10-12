-- Training sessions logged from the Quark iOS app (what was actually done,
-- against the week planned in Google Calendar). One row per user, day and
-- session kind; the app upserts on that key.
create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('kudo', 'gym_a', 'gym_b', 'core_skills', 'mobility', 'other')),
  title text,
  status text not null check (status in ('done', 'partial', 'skipped')),
  notes text,
  calendar_event_id text,
  source text not null default 'quark',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, kind)
);

create index training_sessions_user_date on training_sessions (user_id, date desc);

alter table training_sessions enable row level security;

create policy "training_sessions_select" on training_sessions
  for select using ((select auth.uid()) = user_id);
create policy "training_sessions_insert" on training_sessions
  for insert with check ((select auth.uid()) = user_id);
create policy "training_sessions_update" on training_sessions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "training_sessions_delete" on training_sessions
  for delete using ((select auth.uid()) = user_id);

create or replace function set_training_sessions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger training_sessions_updated_at
  before update on training_sessions
  for each row execute function set_training_sessions_updated_at();
