-- API Keys table for external bot/CLI access
-- Keys are hashed with SHA-256, never stored in plaintext

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  is_active boolean not null default true
);

alter table api_keys enable row level security;

create policy "api_keys_select" on api_keys
  for select using ((select auth.uid()) = user_id);
create policy "api_keys_insert" on api_keys
  for insert with check ((select auth.uid()) = user_id);
create policy "api_keys_update" on api_keys
  for update using ((select auth.uid()) = user_id);

-- Partial index for fast lookup by hash (Edge Function searches by hash)
create index idx_api_keys_hash on api_keys(key_hash) where is_active = true;
