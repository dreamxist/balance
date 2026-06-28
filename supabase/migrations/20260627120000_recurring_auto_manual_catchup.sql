-- Recurring charges: automatic vs manual + catch-up reconciliation.
--
-- Problem this fixes:
--   The daily-charges cron runs with service_role (auth.uid() = NULL). Since
--   20260422235333 hardened create_transaction to require auth.uid() = account
--   owner, every cron-driven charge has failed with 42501 since ~May 2026.
--   It also only ever fired on the EXACT day_of_month, so a missed day was
--   never caught up, and it deduped by description (fragile to renames).
--
-- This migration:
--   1. Adds auto_charge (cobro automático vs manual que paga el usuario) and
--      last_charged_on (display cache) to recurring_charges.
--   2. Adds a partial index + the metadata link used for robust dedup. The
--      source of truth for "already charged this month" is the ledger
--      (transactions.metadata->>'recurring_charge_id'), NOT last_charged_on.
--   3. recurring_charges_detailed view (security_invoker) joining accounts to
--      expose account_name + entity for listing / grouping by card.
--   4. get_recurring_status(p_as_of, p_entity): per-charge due_date + status
--      (charged / due / upcoming) for the current month.
--   5. process_due_recurring_charges(...): SECURITY DEFINER with a dual-path
--      guard so a JWT user only ever touches their own data while the cron
--      (service_role) passes p_user_id explicitly. Reuses the _insert_transaction
--      / _update_account_balance primitives directly (NOT create_transaction,
--      which blocks service_role). Supports a dry-run.
--   6. pay_recurring_charge(...): register a (manual) charge as paid now.
--
-- Security note: process_due_recurring_charges trusts p_user_id when auth.uid()
-- is NULL (the cron path). anon ALSO has auth.uid() = NULL, so EXECUTE is
-- revoked from PUBLIC and granted only to authenticated + service_role.

-- =============================================================================
-- 1. Schema
-- =============================================================================
alter table recurring_charges
  add column if not exists auto_charge boolean not null default true,
  add column if not exists last_charged_on date;

comment on column recurring_charges.auto_charge is
  'true = se cobra solo (cron/tarjeta). false = manual: lo paga el usuario y confirma con pay_recurring_charge.';
comment on column recurring_charges.last_charged_on is
  'Display cache of the last time this charge was registered. NOT the dedup source of truth (the ledger is).';

-- Robust dedup: link generated transactions back to their recurring charge.
-- Partial index only over rows that carry the link (the recurring-generated ones).
create index if not exists idx_tx_recurring_charge
  on transactions ((metadata->>'recurring_charge_id'))
  where metadata ? 'recurring_charge_id';

-- =============================================================================
-- 2. recurring_charges_detailed view (account_name + entity for listing)
-- =============================================================================
create or replace view recurring_charges_detailed with (security_invoker = true) as
select
  rc.id, rc.user_id, rc.name, rc.amount, rc.currency, rc.day_of_month,
  rc.category, rc.account_id, rc.is_active, rc.auto_charge, rc.last_charged_on,
  rc.created_at, rc.updated_at,
  a.name as account_name, a.entity, a.subtype
from recurring_charges rc
join accounts a on a.id = rc.account_id
where rc.user_id = (select auth.uid());

-- =============================================================================
-- 3. _apply_recurring_charge — internal: insert expense + link + update balance
-- =============================================================================
-- Callers MUST validate ownership of p_charge before calling. Dedup is enforced
-- here regardless (ledger-based), so a double invocation never double-charges.
create or replace function _apply_recurring_charge(
  p_charge recurring_charges,
  p_date date,
  p_amount bigint default null
) returns jsonb as $$
declare
  v_account accounts;
  v_amount bigint;
  v_tx transactions;
  v_month_start date := date_trunc('month', p_date)::date;
  v_month_end date := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
begin
  select * into v_account from accounts where id = p_charge.account_id;
  if not found then
    return jsonb_build_object('id', p_charge.id, 'name', p_charge.name,
      'status', 'skipped', 'reason', 'account_missing');
  end if;

  -- Already charged this month?
  --   (a) a transaction we created (metadata link), OR
  --   (b) transition heuristic: an expense this month on the same account whose
  --       description matches the charge name (catches manual entries whose
  --       description was tweaked, e.g. with a month suffix, so the first
  --       catch-up never doubles).
  if exists (
    select 1 from transactions t
    where t.account_id = p_charge.account_id
      and t.date >= v_month_start and t.date <= v_month_end
      and (
        (t.metadata->>'recurring_charge_id') = p_charge.id::text
        or (t.type = 'expense' and t.description ilike '%' || p_charge.name || '%')
      )
  ) then
    return jsonb_build_object('id', p_charge.id, 'name', p_charge.name,
      'status', 'skipped', 'reason', 'already_charged');
  end if;

  v_amount := abs(coalesce(p_amount, p_charge.amount));

  insert into transactions (
    user_id, account_id, type, amount, category, description, entity, date, metadata
  ) values (
    v_account.user_id, p_charge.account_id, 'expense', v_amount, p_charge.category,
    p_charge.name, v_account.entity, p_date,
    jsonb_build_object('recurring_charge_id', p_charge.id)
  ) returning * into v_tx;

  perform _update_account_balance(p_charge.account_id, -v_amount);

  update recurring_charges
    set last_charged_on = p_date, updated_at = now()
    where id = p_charge.id;

  return jsonb_build_object('id', p_charge.id, 'name', p_charge.name,
    'status', 'charged', 'amount', v_amount, 'transaction_id', v_tx.id);
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 4. get_recurring_status(p_as_of, p_entity) — per-charge due_date + status
-- =============================================================================
create or replace function get_recurring_status(
  p_as_of date default current_date,
  p_entity entity_type default null
) returns jsonb as $$
declare
  v_result jsonb;
  v_month_start date := date_trunc('month', p_as_of)::date;
  v_month_end date := (date_trunc('month', p_as_of) + interval '1 month - 1 day')::date;
  v_days_in_month int := extract(day from (date_trunc('month', p_as_of) + interval '1 month - 1 day'))::int;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.due_date, r.name), '[]'::jsonb)
  into v_result
  from (
    select
      base.*,
      case
        when base.charged then 'charged'
        when base.due_date <= p_as_of then 'due'
        else 'upcoming'
      end as status
    from (
      select
        rc.id, rc.name, rc.amount, rc.currency, rc.day_of_month, rc.category,
        rc.account_id, a.name as account_name, a.entity, a.subtype,
        rc.auto_charge, rc.last_charged_on,
        make_date(
          extract(year from p_as_of)::int,
          extract(month from p_as_of)::int,
          least(rc.day_of_month, v_days_in_month)
        ) as due_date,
        exists (
          select 1 from transactions t
          where t.account_id = rc.account_id
            and t.date >= v_month_start and t.date <= v_month_end
            and (
              (t.metadata->>'recurring_charge_id') = rc.id::text
              or (t.type = 'expense' and t.description ilike '%' || rc.name || '%')
            )
        ) as charged
      from recurring_charges rc
      join accounts a on a.id = rc.account_id
      where rc.user_id = (select auth.uid())
        and rc.is_active = true
        and (p_entity is null or a.entity = p_entity)
    ) base
  ) r;

  return v_result;
end;
$$ language plpgsql security invoker;

-- =============================================================================
-- 5. process_due_recurring_charges — catch-up registration (cron + user)
-- =============================================================================
create or replace function process_due_recurring_charges(
  p_as_of date default current_date,
  p_include_manual boolean default false,
  p_user_id uuid default null,
  p_dry_run boolean default false,
  p_entity entity_type default null
) returns jsonb as $$
declare
  v_uid uuid;
  v_charge recurring_charges;
  v_account accounts;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_days_in_month int := extract(day from (date_trunc('month', p_as_of) + interval '1 month - 1 day'))::int;
  v_month_start date := date_trunc('month', p_as_of)::date;
  v_month_end date := (date_trunc('month', p_as_of) + interval '1 month - 1 day')::date;
  v_due_date date;
begin
  -- Dual-path auth: a JWT user can only act on themselves; the cron
  -- (service_role, auth.uid() = NULL) must pass p_user_id explicitly. anon is
  -- blocked by the EXECUTE grants below, so a NULL auth.uid() here means cron.
  v_uid := (select auth.uid());
  if v_uid is not null then
    p_user_id := v_uid;
  elsif p_user_id is null then
    raise exception 'p_user_id is required when called without a user JWT'
      using errcode = '22023';
  end if;

  for v_charge in
    select rc.* from recurring_charges rc
    join accounts a on a.id = rc.account_id
    where rc.user_id = p_user_id
      and rc.is_active = true
      and (p_include_manual or rc.auto_charge = true)
      and (p_entity is null or a.entity = p_entity)
    order by rc.day_of_month
  loop
    v_due_date := make_date(
      extract(year from p_as_of)::int,
      extract(month from p_as_of)::int,
      least(v_charge.day_of_month, v_days_in_month)
    );
    -- Only charges due on/before as_of. Upcoming ones are left untouched.
    if v_due_date > p_as_of then
      continue;
    end if;

    -- Defense in depth: the charge's account must belong to p_user_id.
    select * into v_account from accounts
    where id = v_charge.account_id and user_id = p_user_id;
    if not found then
      v_results := v_results || jsonb_build_object('id', v_charge.id,
        'name', v_charge.name, 'status', 'skipped', 'reason', 'account_unauthorized');
      continue;
    end if;

    if p_dry_run then
      if exists (
        select 1 from transactions t
        where t.account_id = v_charge.account_id
          and t.date >= v_month_start and t.date <= v_month_end
          and (
            (t.metadata->>'recurring_charge_id') = v_charge.id::text
            or (t.type = 'expense' and t.description ilike '%' || v_charge.name || '%')
          )
      ) then
        v_one := jsonb_build_object('id', v_charge.id, 'name', v_charge.name,
          'status', 'skipped', 'reason', 'already_charged',
          'amount', v_charge.amount, 'auto_charge', v_charge.auto_charge,
          'account', v_account.name, 'due_date', v_due_date);
      else
        v_one := jsonb_build_object('id', v_charge.id, 'name', v_charge.name,
          'status', 'would_charge', 'amount', v_charge.amount,
          'auto_charge', v_charge.auto_charge, 'account', v_account.name,
          'due_date', v_due_date);
      end if;
    else
      -- Record on the real due date (keeps the month correct for reconciliation).
      v_one := _apply_recurring_charge(v_charge, v_due_date)
        || jsonb_build_object('auto_charge', v_charge.auto_charge, 'account', v_account.name);
    end if;

    v_results := v_results || v_one;
  end loop;

  return jsonb_build_object(
    'as_of', p_as_of,
    'dry_run', p_dry_run,
    'charges', v_results
  );
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 6. pay_recurring_charge — register a (manual) charge as paid
-- =============================================================================
create or replace function pay_recurring_charge(
  p_charge_id uuid,
  p_date date default current_date,
  p_amount bigint default null
) returns jsonb as $$
declare
  v_charge recurring_charges;
begin
  -- SECURITY: enforce ownership of the charge.
  select * into v_charge from recurring_charges
  where id = p_charge_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Recurring charge not found or unauthorized'
      using errcode = '42501';
  end if;

  return _apply_recurring_charge(v_charge, p_date, p_amount);
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 7. Grants — lock down the SECURITY DEFINER cron path against anon
-- =============================================================================
-- Supabase grants EXECUTE to anon/authenticated by default, so revoke from anon
-- explicitly (not just PUBLIC): otherwise anon could spoof p_user_id through the
-- cron path of process_due_recurring_charges.
revoke all on function _apply_recurring_charge(recurring_charges, date, bigint) from public, anon, authenticated;

revoke all on function process_due_recurring_charges(date, boolean, uuid, boolean, entity_type) from public, anon;
grant execute on function process_due_recurring_charges(date, boolean, uuid, boolean, entity_type) to authenticated, service_role;

revoke all on function get_recurring_status(date, entity_type) from public, anon;
grant execute on function get_recurring_status(date, entity_type) to authenticated;

revoke all on function pay_recurring_charge(uuid, date, bigint) from public, anon;
grant execute on function pay_recurring_charge(uuid, date, bigint) to authenticated;
