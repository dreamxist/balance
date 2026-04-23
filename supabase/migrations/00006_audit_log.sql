-- Audit log table (append-only per D-06)
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- Index for querying by table and record
create index idx_audit_log_table_record on audit_log(table_name, record_id);
create index idx_audit_log_created on audit_log(created_at desc);

-- Generic trigger function (reusable on any table with uuid id)
-- Per D-05: records old_row, new_row, operation, table_name, user_id, timestamp
create or replace function audit_trigger_fn()
returns trigger as $$
begin
  insert into audit_log (table_name, record_id, operation, old_row, new_row, user_id)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id)::text,
    TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end,
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      null
    )::uuid
  );
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;
