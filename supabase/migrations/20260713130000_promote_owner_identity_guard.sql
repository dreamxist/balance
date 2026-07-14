-- promote_email_movements v5: identity-checked mirror links.
--
-- Adversarial review of v4 found that the %transfer_in late-mirror link kept
-- the very heuristic v4 removed from the out leg: same account + same amount
-- ± 1 day was treated as proof. A client payment landing on an account within
-- a day of an own transfer of the same amount would link to the transfer leg
-- and the real income would silently never book.
--
-- Own transfers always show the USER as the sender in the incoming email, so
-- v5 additionally requires the counterparty to look like the account owner
-- (>= 2 significant name tokens from profiles.name, accent-insensitive)
-- before linking an incoming email to an existing transfer leg — both in the
-- late-mirror path and when consuming a pending mirror. When there is no
-- profile name or no counterparty there is no evidence either way and the
-- amount/date heuristic stands (legacy behavior; errs toward linking).
--
-- Also: a dest_hint that resolves to the ORIGIN account itself (degenerate
-- self-transfer) no longer books a canceling pair — it falls through to the
-- expense path.

create or replace function _counterparty_is_owner(
  p_user_id uuid,
  p_counterparty text
) returns boolean
language sql
stable
as $$
  with norm as (
    select
      translate(lower(coalesce(p_counterparty, '')), 'áéíóúñ', 'aeioun') as cp,
      translate(lower(coalesce(
        (select name from profiles where id = p_user_id), '')), 'áéíóúñ', 'aeioun') as owner
  ),
  words as (
    select w from norm, unnest(string_to_array(norm.owner, ' ')) as w
    where length(w) >= 3
  )
  select case
    when (select cp from norm) = '' then true      -- no evidence: allow
    when (select count(*) from words) = 0 then true -- no profile name: allow
    else (
      select count(*) >= least(2, (select count(*) from words))
      from words, norm
      where position(words.w in norm.cp) > 0
    )
  end;
$$;

revoke all on function _counterparty_is_owner(uuid, text) from public, anon, authenticated;

create or replace function promote_email_movements(
  p_user_id uuid default null,
  p_usd_rate numeric default null
) returns jsonb as $$
declare
  v_uid uuid := (select auth.uid());
  v_row email_movements;
  v_account accounts;
  v_dest accounts;
  v_mirror email_movements;
  v_existing_tx_id uuid;
  v_category text;
  v_amount bigint;
  v_meta jsonb;
  v_in_meta jsonb;
  v_tx transactions;
  v_tx_in transactions;
  v_bank_keyword text;
  v_spa_accounts int;
  v_promoted int := 0;
  v_skipped int := 0;
  v_pending int := 0;
  v_errors int := 0;
begin
  if v_uid is not null then
    p_user_id := v_uid;
  elsif p_user_id is null then
    raise exception 'p_user_id is required when called without a user JWT'
      using errcode = '22023';
  end if;

  for v_row in
    select * from email_movements
    where user_id = p_user_id and status = 'pending'
    order by (source not like '%transfer_out'), email_date, created_at
  loop
    begin
      select * into v_row from email_movements where id = v_row.id;
      if v_row.status <> 'pending' then
        continue;
      end if;

      select t.id into v_existing_tx_id from transactions t
      where t.user_id = p_user_id
        and (
          t.metadata->>'gmail_message_id' = v_row.gmail_message_id
          or (v_row.bank_tx_id is not null and t.metadata->>'bank_tx_id' = v_row.bank_tx_id)
        )
      limit 1;
      if v_existing_tx_id is not null then
        update email_movements
        set status = 'promoted', transaction_id = v_existing_tx_id
        where id = v_row.id;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_row.amount is null then
        raise exception 'missing amount';
      end if;

      v_amount := v_row.amount;
      v_meta := jsonb_build_object(
        'gmail_message_id', v_row.gmail_message_id,
        'source', v_row.source
      );
      if v_row.bank_tx_id is not null then
        v_meta := v_meta || jsonb_build_object('bank_tx_id', v_row.bank_tx_id);
      end if;
      if v_row.currency = 'USD' then
        if p_usd_rate is null or p_usd_rate <= 0 then
          v_pending := v_pending + 1;
          continue;
        end if;
        v_amount := round(v_row.amount * p_usd_rate / 100)::bigint;
        v_meta := v_meta || jsonb_build_object(
          'fx_estimated', true,
          'original_usd_cents', v_row.amount,
          'usd_rate', p_usd_rate
        );
      end if;

      v_account := _match_account_by_hint(p_user_id, v_row.account_hint, v_row.currency);
      if v_account.id is null then
        raise exception 'no account matches hint "%"', coalesce(v_row.account_hint, '');
      end if;

      v_bank_keyword := case
        when v_row.source like 'bancochile%' then 'chile'
        when v_row.source like 'bice%' then 'bice'
        when v_row.source like 'mp_%' then 'mercado'
        when v_row.source like 'tenpo%' then 'tenpo'
        when v_row.source like 'bci%' then 'bci'
      end;

      if v_row.source in ('bancochile_tc', 'bancochile_pago') then
        select r.category into v_category from categorization_rules r
        where r.user_id = p_user_id
          and position(upper(r.pattern) in upper(coalesce(v_row.merchant, v_row.counterparty, ''))) > 0
        order by r.priority desc, r.created_at asc
        limit 1;

        insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
        values (p_user_id, v_account.id, 'expense', v_amount,
                coalesce(v_row.merchant, v_row.counterparty, 'Compra'),
                v_category, v_account.entity, coalesce(v_row.email_date::date, current_date), v_meta)
        returning * into v_tx;
        perform _update_account_balance(v_account.id, -v_amount);

      elsif v_row.source = 'bci_spa' then
        if v_account.entity = 'spa' then
          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
          values (p_user_id, v_account.id, 'income', v_amount,
                  coalesce(v_row.counterparty, 'Transferencia recibida'),
                  null, 'spa', coalesce(v_row.email_date::date, current_date), v_meta)
          returning * into v_tx;
          perform _update_account_balance(v_account.id, v_amount);
        else
          select count(*) into v_spa_accounts from accounts a
          where a.user_id = p_user_id and not a.is_archived
            and a.entity = 'spa' and a.subtype in ('debit', 'cash');
          if v_spa_accounts > 1 then
            raise exception 'multiple SpA accounts: cannot infer BCI origin account';
          end if;
          select a.* into v_dest from accounts a
          where a.user_id = p_user_id and not a.is_archived
            and a.entity = 'spa' and a.subtype in ('debit', 'cash')
          limit 1;
          if v_dest.id is null then
            raise exception 'no SpA account found for outgoing BCI transfer';
          end if;

          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
          values (p_user_id, v_dest.id, 'transfer', -v_amount,
                  'Transferencia SpA -> ' || v_account.name, null,
                  'spa', coalesce(v_row.email_date::date, current_date), v_account.id, v_meta)
          returning * into v_tx;
          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
          values (p_user_id, v_account.id, 'transfer', v_amount,
                  'Transferencia <- ' || v_dest.name || ' [spa]', null,
                  v_account.entity, coalesce(v_row.email_date::date, current_date), v_dest.id, '{}'::jsonb)
          returning * into v_tx_in;
          perform _update_account_balance(v_dest.id, -v_amount);
          perform _update_account_balance(v_account.id, v_amount);
        end if;

      elsif v_row.source like '%transfer_in' then
        -- Late mirror: link ONLY when the sender looks like the owner —
        -- an own transfer's incoming email always names the user as sender.
        -- A third-party payment that merely coincides in amount/date books
        -- as income instead of vanishing into an unrelated transfer leg.
        if _counterparty_is_owner(p_user_id, v_row.counterparty) then
          select t.id into v_existing_tx_id from transactions t
          where t.user_id = p_user_id
            and t.account_id = v_account.id
            and t.type = 'transfer'
            and t.amount = v_amount
            and t.date between coalesce(v_row.email_date::date, current_date) - 1
                           and coalesce(v_row.email_date::date, current_date) + 1
          order by t.created_at desc
          limit 1;
          if v_existing_tx_id is not null then
            update email_movements
            set status = 'promoted', transaction_id = v_existing_tx_id
            where id = v_row.id;
            v_skipped := v_skipped + 1;
            continue;
          end if;
        end if;

        insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
        values (p_user_id, v_account.id, 'income', v_amount,
                coalesce(v_row.counterparty, 'Transferencia recibida'),
                null, v_account.entity, coalesce(v_row.email_date::date, current_date), v_meta)
        returning * into v_tx;
        perform _update_account_balance(v_account.id, v_amount);

      elsif v_row.source like '%transfer_out' then
        if v_row.counterparty is not null
           and (v_row.counterparty ilike '%fintual%' or v_row.counterparty ilike '%fintoc%') then
          select a.* into v_dest from accounts a
          where a.user_id = p_user_id and not a.is_archived
            and lower(a.name) like '%fintual%'
          limit 1;
          if v_dest.id is null then
            raise exception 'no Fintual account found for savings transfer';
          end if;

          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
          values (p_user_id, v_account.id, 'expense', v_amount,
                  'Ahorro -> ' || v_dest.name, 'ahorro.inversion',
                  v_account.entity, coalesce(v_row.email_date::date, current_date), v_meta)
          returning * into v_tx;
          perform _update_account_balance(v_account.id, -v_amount);
          perform _update_account_balance(v_dest.id, v_amount);

        else
          v_dest := null;
          if v_row.dest_hint is not null then
            v_dest := _match_account_by_hint(p_user_id, v_row.dest_hint, v_row.currency);
          end if;
          -- Degenerate self-transfer (dest resolves to the origin account):
          -- never book a canceling pair.
          if v_dest.id = v_account.id then
            v_dest := null;
          end if;

          if v_dest.id is not null then
            select m.* into v_mirror from email_movements m
            where m.user_id = p_user_id and m.status = 'pending'
              and m.id <> v_row.id
              and m.source like '%transfer_in'
              and m.amount = v_row.amount
              and abs(extract(epoch from (m.email_date - v_row.email_date))) <= 86400
              and (_match_account_by_hint(p_user_id, m.account_hint, m.currency)).id = v_dest.id
              and _counterparty_is_owner(p_user_id, m.counterparty)
            order by m.email_date
            limit 1;

            v_in_meta := case
              when v_mirror.id is not null then jsonb_build_object(
                'gmail_message_id', v_mirror.gmail_message_id, 'source', v_mirror.source)
              else '{}'::jsonb
            end;

            insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
            values (p_user_id, v_account.id, 'transfer', -v_amount,
                    'Transferencia -> ' || v_dest.name, null,
                    v_account.entity, coalesce(v_row.email_date::date, current_date), v_dest.id, v_meta)
            returning * into v_tx;
            insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
            values (p_user_id, v_dest.id, 'transfer', v_amount,
                    'Transferencia <- ' || v_account.name, null,
                    v_dest.entity, coalesce(v_row.email_date::date, current_date), v_account.id, v_in_meta)
            returning * into v_tx_in;
            perform _update_account_balance(v_account.id, -v_amount);
            perform _update_account_balance(v_dest.id, v_amount);

            if v_mirror.id is not null then
              update email_movements
              set status = 'promoted', transaction_id = v_tx_in.id
              where id = v_mirror.id;
              v_promoted := v_promoted + 1;
            end if;

          else
            select r.category into v_category from categorization_rules r
            where r.user_id = p_user_id
              and position(upper(r.pattern) in upper(coalesce(v_row.merchant, v_row.counterparty, ''))) > 0
            order by r.priority desc, r.created_at asc
            limit 1;

            insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
            values (p_user_id, v_account.id, 'expense', v_amount,
                    coalesce(v_row.counterparty, 'Transferencia enviada'),
                    v_category, v_account.entity, coalesce(v_row.email_date::date, current_date), v_meta)
            returning * into v_tx;
            perform _update_account_balance(v_account.id, -v_amount);
          end if;
        end if;

      elsif v_row.source like '%pago_tc' then
        v_account := _match_account_by_hint(
          p_user_id, v_row.account_hint,
          case when v_row.counterparty ilike '%internacional%' then 'USD' else 'CLP' end
        );
        if v_account.id is null then
          raise exception 'no account matches hint "%"', coalesce(v_row.account_hint, '');
        end if;
        if v_account.subtype = 'credit_card' then
          v_dest := v_account;
          select a.* into v_account from accounts a
          where a.user_id = p_user_id and not a.is_archived
            and a.subtype in ('debit', 'cash')
            and lower(a.name) like '%' || v_bank_keyword || '%'
          limit 1;
          if v_account.id is null then
            raise exception 'no debit account found for TC payment (bank %)', v_bank_keyword;
          end if;
        else
          select a.* into v_dest from accounts a
          where a.user_id = p_user_id and not a.is_archived
            and a.subtype = 'credit_card'
            and lower(a.name) like '%' || v_bank_keyword || '%'
          limit 1;
          if v_dest.id is null then
            raise exception 'no credit card account found for TC payment (bank %)', v_bank_keyword;
          end if;
        end if;

        insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
        values (p_user_id, v_account.id, 'transfer', -v_amount,
                'Pago TC -> ' || v_dest.name, null,
                v_account.entity, coalesce(v_row.email_date::date, current_date), v_dest.id, v_meta)
        returning * into v_tx;
        insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
        values (p_user_id, v_dest.id, 'transfer', v_amount,
                'Pago TC <- ' || v_account.name, null,
                v_dest.entity, coalesce(v_row.email_date::date, current_date), v_account.id, '{}'::jsonb)
        returning * into v_tx_in;
        perform _update_account_balance(v_account.id, -v_amount);
        perform _update_account_balance(v_dest.id, v_amount);

      else
        raise exception 'unhandled source %', v_row.source;
      end if;

      update email_movements
      set status = 'promoted', transaction_id = v_tx.id
      where id = v_row.id;
      v_promoted := v_promoted + 1;

    exception when others then
      update email_movements
      set status = 'error', error_detail = SQLERRM
      where id = v_row.id;
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object(
    'promoted', v_promoted,
    'skipped_existing', v_skipped,
    'pending', v_pending,
    'errors', v_errors
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function promote_email_movements(uuid, numeric) from public, anon;
grant execute on function promote_email_movements(uuid, numeric) to authenticated, service_role;
