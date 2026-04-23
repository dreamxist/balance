-- Complete onboarding: atomically creates accounts + opening balances + marks user as onboarded
-- Profiles table already has: name, is_onboarded, features columns (from 00002_profiles.sql)

create or replace function complete_onboarding(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_account accounts;
  v_accounts_created int := 0;
  v_item jsonb;
  v_display_name text;
  v_features jsonb;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Check if already onboarded
  if exists (select 1 from profiles where id = v_uid and is_onboarded = true) then
    raise exception 'User already completed onboarding';
  end if;

  -- Create accounts + opening balances
  for v_item in select * from jsonb_array_elements(p_data -> 'accounts')
  loop
    insert into accounts (user_id, name, type, subtype, entity, currency, balance, credit_limit, on_budget)
    values (
      v_uid,
      v_item ->> 'name',
      (v_item ->> 'type')::account_type,
      (v_item ->> 'subtype')::account_subtype,
      'personal',
      'CLP',
      (v_item ->> 'balance')::bigint,
      case when v_item ->> 'credit_limit' is not null
        then (v_item ->> 'credit_limit')::bigint
        else null
      end,
      true
    )
    returning * into v_account;

    -- Create opening balance transaction (registers balance in accumulated without moving it)
    perform _insert_transaction(
      v_uid, v_account.id, 'adjustment',
      v_account.balance, null, 'Apertura: ' || v_account.name,
      'personal', current_date
    );

    v_accounts_created := v_accounts_created + 1;
  end loop;

  -- Update profile
  v_display_name := p_data -> 'profile' ->> 'display_name';
  v_features := coalesce(p_data -> 'profile' -> 'features', '{}'::jsonb);

  update profiles
  set
    name = coalesce(v_display_name, name),
    features = v_features,
    is_onboarded = true,
    updated_at = now()
  where id = v_uid;

  return jsonb_build_object(
    'accounts_created', v_accounts_created,
    'is_onboarded', true
  );
end;
$$;
