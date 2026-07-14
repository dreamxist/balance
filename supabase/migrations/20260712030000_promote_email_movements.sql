-- promote_email_movements: turns pending email_movements into transactions.
--
-- Runs as security definer with the same dual-path auth as
-- process_due_recurring_charges: a JWT user acts on themselves; the gmail-sync
-- cron (service_role, auth.uid() = NULL) passes p_user_id explicitly. Uses
-- direct inserts + _update_account_balance (create_transaction requires
-- auth.uid() = owner, unavailable on the cron path).
--
-- Classification rules (PRD docs/prd-gmail-conciliacion.md):
--  1. bank_tx_id / gmail_message_id already in transactions.metadata -> link
--     existing transaction, mark promoted (dedup, backfill-safe).
--  2. transfer_out with a pending mirror transfer_in (same amount, ±1 day) ->
--     one transfer pair between own accounts; both staging rows share the pair.
--  3. TC purchase / service payment -> expense; category from
--     categorization_rules (highest priority wins), NULL without a match.
--  4. transfer_out to Fintual/Fintoc -> transfer to the Fintual account with
--     category ahorro.inversion.
--  5. transfer_in from a third party -> income, category ALWAYS NULL.
--  6. pago_tc -> transfer debit -> credit_card (docs/workflows.md: paying the
--     TC is not an expense). One side resolves by account_hint, the other by
--     the bank keyword of the source.
--  7. bci_spa -> entity spa, income, category NULL (SpA only receives via BCI).
--  8. USD -> converted with p_usd_rate (CLP per USD, amount in cents),
--     metadata.fx_estimated + original_usd_cents. Without rate -> stays pending.
--
-- Account matching: account_hint against accounts.metadata
-- ("bank_account_numbers": [..] for bank accounts, "card_last4" for TCs).
-- Unmatched accounts mark the row 'error' with error_detail (never silent).

-- Dedup indexes, same pattern as recurring_charge_id
create unique index idx_transactions_gmail_message_id
  on transactions ((metadata->>'gmail_message_id'))
  where metadata ? 'gmail_message_id';

create index idx_transactions_bank_tx_id
  on transactions ((metadata->>'bank_tx_id'))
  where metadata ? 'bank_tx_id';

-- Match one active account of the user by email hint (account number or card last4)
create function _match_account_by_hint(p_user_id uuid, p_hint text)
returns accounts as $$
  select a.* from accounts a
  where a.user_id = p_user_id
    and not a.is_archived
    and p_hint is not null
    and (
      a.metadata->'bank_account_numbers' ? p_hint
      or a.metadata->>'card_last4' = right(p_hint, 4)
    )
  limit 1;
$$ language sql stable;

revoke all on function _match_account_by_hint(uuid, text) from public, anon, authenticated;

create function promote_email_movements(
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
  v_tx transactions;
  v_tx_in transactions;
  v_bank_keyword text;
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
    -- transfer_out first so mirrors are consumed before the _in rows
    -- would be misclassified as third-party income
    order by (source not like '%transfer_out'), email_date, created_at
  loop
    begin
      -- Re-read: a mirror consumed by a previous iteration is no longer pending
      select * into v_row from email_movements where id = v_row.id;
      if v_row.status <> 'pending' then
        continue;
      end if;

      -- Rule 1: dedup against already-promoted transactions
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

      -- Rule 8: USD needs a rate; without one the row simply waits
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

      -- Resolve the account this email belongs to
      v_account := _match_account_by_hint(p_user_id, v_row.account_hint);
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
        -- Rule 3: expense; category from rules (highest priority wins)
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
        -- Rule 7: SpA income, category NULL
        insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
        values (p_user_id, v_account.id, 'income', v_amount,
                coalesce(v_row.counterparty, 'Transferencia recibida'),
                null, 'spa', coalesce(v_row.email_date::date, current_date), v_meta)
        returning * into v_tx;
        perform _update_account_balance(v_account.id, v_amount);

      elsif v_row.source like '%transfer_in' then
        -- Rule 5: third-party income, category ALWAYS NULL
        insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
        values (p_user_id, v_account.id, 'income', v_amount,
                coalesce(v_row.counterparty, 'Transferencia recibida'),
                null, v_account.entity, coalesce(v_row.email_date::date, current_date), v_meta)
        returning * into v_tx;
        perform _update_account_balance(v_account.id, v_amount);

      elsif v_row.source like '%transfer_out' then
        -- Rule 4: savings to Fintual
        if v_row.counterparty is not null
           and (v_row.counterparty ilike '%fintual%' or v_row.counterparty ilike '%fintoc%') then
          select a.* into v_dest from accounts a
          where a.user_id = p_user_id and not a.is_archived
            and lower(a.name) like '%fintual%'
          limit 1;
          if v_dest.id is null then
            raise exception 'no Fintual account found for savings transfer';
          end if;

          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
          values (p_user_id, v_account.id, 'transfer', -v_amount,
                  'Ahorro -> ' || v_dest.name, 'ahorro.inversion',
                  v_account.entity, coalesce(v_row.email_date::date, current_date), v_dest.id, v_meta)
          returning * into v_tx;
          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
          values (p_user_id, v_dest.id, 'transfer', v_amount,
                  'Ahorro <- ' || v_account.name, 'ahorro.inversion',
                  v_dest.entity, coalesce(v_row.email_date::date, current_date), v_account.id, '{}'::jsonb)
          returning * into v_tx_in;
          perform _update_account_balance(v_account.id, -v_amount);
          perform _update_account_balance(v_dest.id, v_amount);

        else
          -- Rule 2: mirror pair -> own-to-own transfer
          select m.* into v_mirror from email_movements m
          where m.user_id = p_user_id and m.status = 'pending'
            and m.id <> v_row.id
            and m.source like '%transfer_in'
            and m.amount = v_row.amount
            and abs(extract(epoch from (m.email_date - v_row.email_date))) <= 86400
          limit 1;

          if v_mirror.id is not null then
            v_dest := _match_account_by_hint(p_user_id, v_mirror.account_hint);
            if v_dest.id is null then
              raise exception 'mirror email % has no matching account', v_mirror.gmail_message_id;
            end if;

            insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
            values (p_user_id, v_account.id, 'transfer', -v_amount,
                    'Transferencia -> ' || v_dest.name, null,
                    v_account.entity, coalesce(v_row.email_date::date, current_date), v_dest.id, v_meta)
            returning * into v_tx;
            insert into transactions (user_id, account_id, type, amount, description, category, entity, date, transfer_to, metadata)
            values (p_user_id, v_dest.id, 'transfer', v_amount,
                    'Transferencia <- ' || v_account.name, null,
                    v_dest.entity, coalesce(v_mirror.email_date::date, current_date), v_account.id,
                    jsonb_build_object('gmail_message_id', v_mirror.gmail_message_id, 'source', v_mirror.source))
            returning * into v_tx_in;
            perform _update_account_balance(v_account.id, -v_amount);
            perform _update_account_balance(v_dest.id, v_amount);

            update email_movements
            set status = 'promoted', transaction_id = v_tx_in.id
            where id = v_mirror.id;
            v_promoted := v_promoted + 1;

          else
            -- Rule 3 (transfer flavor): outgoing to third party -> expense
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
        -- Rule 6: transfer debit -> credit_card
        if v_account.subtype = 'credit_card' then
          v_dest := v_account;  -- hint matched the card; find the debit side
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

-- Lock down the cron path against anon (same as process_due_recurring_charges)
revoke all on function promote_email_movements(uuid, numeric) from public, anon;
grant execute on function promote_email_movements(uuid, numeric) to authenticated, service_role;
