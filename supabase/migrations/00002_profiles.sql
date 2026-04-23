create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  is_onboarded boolean not null default false,
  features jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select" on profiles
  for select using ((select auth.uid()) = id);

create policy "profiles_update" on profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
