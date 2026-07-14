-- Watermark storage for gmail-sync: last successful fetch per user.
-- Written by the edge function with service role; owner can read their own.

create table sync_state (
  user_id uuid primary key references auth.users(id) not null,
  gmail_watermark timestamptz,
  updated_at timestamptz not null default now()
);

alter table sync_state enable row level security;

create policy "sync_state_select" on sync_state
  for select using ((select auth.uid()) = user_id);
