-- Error log table for exception handlers in database functions
create table error_log (
  id bigint generated always as identity primary key,
  function_name text not null,
  error_message text not null,
  error_detail text,
  context jsonb default '{}',
  created_at timestamptz not null default now()
);

-- RLS enabled with NO policies = only service_role can read/write
-- This is intentional: error_log is for admin/debugging only
alter table error_log enable row level security;
