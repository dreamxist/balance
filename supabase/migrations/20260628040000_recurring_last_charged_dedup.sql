-- Make last_charged_on a first-class dedup signal.
--
-- The original recurring engine deduped purely off the ledger
-- (transactions.metadata->>'recurring_charge_id' or a name heuristic). That is
-- the right default, but it leaves no way to say "this charge is already handled
-- this month, do not register it" WITHOUT creating a transaction — needed when
-- the books were reconciled by hand (e.g. the migration month) or when a charge
-- was paid outside the app.
--
-- This migration treats a charge as already handled for the month when
-- last_charged_on >= the first day of as_of's month, in addition to the
-- ledger-based checks. Setting last_charged_on to a date in the current month
-- now suppresses that month's auto-charge cleanly; the next month re-opens it.

-- =============================================================================
-- _apply_recurring_charge — skip when last_charged_on marks the month handled
-- =============================================================================
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

  -- Explicitly marked as handled this month (no transaction needed).
  if p_charge.last_charged_on is not null and p_charge.last_charged_on >= v_month_start then
    return jsonb_build_object('id', p_charge.id, 'name', p_charge.name,
      'status', 'skipped', 'reason', 'already_charged');
  end if;

  -- Already charged this month per the ledger?
  --   (a) a transaction we created (metadata link), OR
  --   (b) transition heuristic: an expense this month on the same account whose
  --       description matches the charge name.
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
-- get_recurring_status — last_charged_on counts as charged for the month
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
        (
          (rc.last_charged_on is not null and rc.last_charged_on >= v_month_start)
          or exists (
            select 1 from transactions t
            where t.account_id = rc.account_id
              and t.date >= v_month_start and t.date <= v_month_end
              and (
                (t.metadata->>'recurring_charge_id') = rc.id::text
                or (t.type = 'expense' and t.description ilike '%' || rc.name || '%')
              )
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
-- process_due_recurring_charges — mirror the last_charged_on check in dry-run
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
  v_handled boolean;
begin
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
    if v_due_date > p_as_of then
      continue;
    end if;

    select * into v_account from accounts
    where id = v_charge.account_id and user_id = p_user_id;
    if not found then
      v_results := v_results || jsonb_build_object('id', v_charge.id,
        'name', v_charge.name, 'status', 'skipped', 'reason', 'account_unauthorized');
      continue;
    end if;

    if p_dry_run then
      v_handled := (v_charge.last_charged_on is not null and v_charge.last_charged_on >= v_month_start)
        or exists (
          select 1 from transactions t
          where t.account_id = v_charge.account_id
            and t.date >= v_month_start and t.date <= v_month_end
            and (
              (t.metadata->>'recurring_charge_id') = v_charge.id::text
              or (t.type = 'expense' and t.description ilike '%' || v_charge.name || '%')
            )
        );
      if v_handled then
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
