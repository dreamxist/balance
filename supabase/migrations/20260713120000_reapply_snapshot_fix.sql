-- Re-apply 20260628120000_fix_snapshot_signed_personal_scope verbatim.
-- That file was recovered into the repo AFTER later migrations had already
-- been applied, so its back-dated version number means ordered runners skip
-- it in environments migrated past 2026-07-12. The body is idempotent
-- (create or replace), so re-emitting it under a current version guarantees
-- every environment actually runs it.

-- Fix create_snapshot delta/status computation.
--
-- The previous version (00019_snapshots.sql) computed `accumulated` as a raw
-- `sum(amount)` over income/expense/refund/adjustment, which:
--   1. did NOT apply signs (expenses were added as positive), and
--   2. did NOT scope by on_budget account nor by entity.
-- As a result `delta = position - accumulated` was always wrong and every
-- snapshot was flagged `unbalanced`, even when the personal reconciliation was
-- perfectly balanced (delta 0).
--
-- This redefinition makes `position` and `accumulated` match
-- get_reconciliation_status('personal') exactly:
--   * position    = on_budget, non-archived, personal account balances
--   * accumulated = SIGNED flows (income/refund +, expense -, adjustment ±)
--                   over those same on_budget personal accounts
-- net_worth / total_assets / total_liabilities stay global (all accounts),
-- unchanged.

create or replace function create_snapshot(
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
  select
    coalesce(sum(case when type = 'asset' then balance else 0 end), 0),
    coalesce(sum(case when type = 'liability' then abs(balance) else 0 end), 0)
  into v_total_assets, v_total_liabilities
  from accounts
  where not is_archived
    and user_id = (select auth.uid());

  v_net_worth := v_total_assets - v_total_liabilities;

  -- Position = on_budget, non-archived, personal accounts (matches reconciliation_status)
  select coalesce(sum(balance), 0) into v_position
  from accounts
  where not is_archived
    and on_budget = true
    and entity = 'personal'
    and user_id = (select auth.uid());

  -- Accumulated = SIGNED flows over on_budget personal accounts
  -- (identical to get_reconciliation_status('personal'))
  select coalesce(sum(
    case
      when t.type = 'income' then t.amount
      when t.type = 'refund' then t.amount
      when t.type = 'expense' then -t.amount
      when t.type = 'adjustment' then t.amount
      else 0
    end
  ), 0) into v_accumulated
  from transactions t
  join accounts a on a.id = t.account_id
  where t.type in ('income', 'expense', 'refund', 'adjustment')
    and t.user_id = (select auth.uid())
    and a.on_budget = true
    and a.entity = 'personal';

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

