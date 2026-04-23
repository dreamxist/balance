-- Snapshots: immutable record of financial state at a point in time
-- Per D-10, D-11, D-12, D-13, RECON-04, RECON-05, RECON-06, RECON-07

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  date date not null,
  total_assets bigint not null,
  total_liabilities bigint not null,
  net_worth bigint not null,
  position bigint not null,
  accumulated bigint not null,
  delta bigint not null,
  status snapshot_status not null,
  entries jsonb not null,
  created_at timestamptz not null default now(),

  constraint unique_snapshot_per_date unique (user_id, date),
  constraint net_worth_consistent check (net_worth = total_assets - total_liabilities)
);

create index idx_snapshots_user_date on snapshots(user_id, date desc);

alter table snapshots enable row level security;

create policy "snapshots_select" on snapshots
  for select using ((select auth.uid()) = user_id);

create policy "snapshots_insert" on snapshots
  for insert with check ((select auth.uid()) = user_id);

-- No UPDATE or DELETE policies: snapshots are immutable (D-11)

-- create_snapshot: captures financial state at a given date
-- Uses advisory lock to prevent concurrent creation (D-10)
-- One snapshot per date per user (D-12)
-- Off-budget excluded from position/delta, included in net_worth (D-13, RECON-06)
create function create_snapshot(
  p_date date default current_date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot snapshots;
  v_entries jsonb;
  v_total_assets bigint;
  v_total_liabilities bigint;
  v_net_worth bigint;
  v_position bigint;
  v_accumulated bigint;
  v_delta bigint;
begin
  if not pg_try_advisory_xact_lock(hashtext('snapshot_' || (select auth.uid())::text)) then
    raise exception 'Another snapshot operation is in progress. Try again.'
      using errcode = 'P0003';
  end if;

  if exists (select 1 from snapshots where date = p_date and user_id = (select auth.uid())) then
    raise exception 'Snapshot for date % already exists', p_date
      using errcode = 'P0004';
  end if;

  -- Capture all non-archived account balances (RECON-04)
  select jsonb_agg(jsonb_build_object(
    'account_id', id, 'name', name, 'type', type,
    'subtype', subtype, 'balance', balance, 'on_budget', on_budget
  )) into v_entries
  from accounts
  where not is_archived
    and user_id = (select auth.uid());

  -- Total assets and liabilities from ALL accounts (for net_worth, D-13)
  -- Assets have positive balances, liabilities have negative balances
  select
    coalesce(sum(case when type = 'asset' then balance else 0 end), 0),
    coalesce(sum(case when type = 'liability' then abs(balance) else 0 end), 0)
  into v_total_assets, v_total_liabilities
  from accounts
  where not is_archived
    and user_id = (select auth.uid());

  v_net_worth := v_total_assets - v_total_liabilities;

  -- Position from on_budget accounts only (matches reconciliation_status view)
  select coalesce(sum(balance), 0) into v_position
  from accounts
  where not is_archived
    and on_budget = true
    and user_id = (select auth.uid());

  -- Accumulated from transaction log (same as reconciliation_status)
  select coalesce(sum(amount), 0) into v_accumulated
  from transactions
  where type in ('income', 'expense', 'refund', 'adjustment')
    and user_id = (select auth.uid());

  v_delta := v_position - v_accumulated;

  insert into snapshots (
    user_id, date, total_assets, total_liabilities,
    net_worth, position, accumulated, delta, status, entries
  ) values (
    (select auth.uid()), p_date, v_total_assets, v_total_liabilities,
    v_net_worth, v_position, v_accumulated, v_delta,
    case when v_delta = 0 then 'balanced'::snapshot_status else 'unbalanced'::snapshot_status end,
    coalesce(v_entries, '[]'::jsonb)
  ) returning * into v_snapshot;

  return to_jsonb(v_snapshot);
end;
$$;

-- get_snapshot_history: returns recent snapshots ordered by date (RECON-05)
create function get_snapshot_history(
  p_limit int default 12
) returns setof snapshots
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select *
  from snapshots
  where user_id = (select auth.uid())
  order by date desc
  limit p_limit;
end;
$$;
