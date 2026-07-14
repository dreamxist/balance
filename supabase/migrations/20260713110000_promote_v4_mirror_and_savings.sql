-- promote_email_movements v4: provable mirror pairs + savings as expense.
--
-- Fixes over v3 (found in post-deploy review):
--
-- 1. MIRROR FALSE POSITIVE. v3 collapsed any pending %transfer_out with any
--    pending %transfer_in of the same amount within ±1 day into an own-to-own
--    transfer pair — so an unrelated rent payment and client payment of the
--    same amount on the same day merged and vanished from income AND expenses.
--    v4 only collapses when the OUT email names a destination account number
--    (new column dest_hint, extracted by the parsers) that resolves to one of
--    the user's own accounts. No dest_hint proof -> classify independently.
--
-- 2. LATE MIRROR DOUBLE-BOOKING. The incoming half of an own transfer that
--    arrives in a later run (or that the user already recorded manually) used
--    to book as a duplicate income. v4 links a %transfer_in email to an
--    existing same-amount transfer IN-leg on the same account (±1 day) instead
--    of double-booking.
--
-- 3. SAVINGS DOUBLE-LEG. v3 created Fintual savings as a transfer pair with
--    'ahorro.inversion' on BOTH legs, which summed to 0 inside the ahorro
--    bucket. The user's actual books (prod, July 2026) record savings as an
--    expense with an ahorro category plus a direct balance update on the
--    off-budget destination — v4 does exactly that: expense on the origin
--    account (counts in accumulated AND in the ahorro bucket) + direct
--    balance credit on the off-budget savings account (visible in patrimonio,
--    outside reconciliation). Delta stays balanced: position and accumulated
--    both drop by the saved amount.
--
-- 4. SPA ORIGIN GUESSING. With more than one SpA account, the outgoing-BCI
--    branch silently debited an arbitrary one. v4 fails loudly instead.

alter table email_movements add column if not exists dest_hint text;

-- 'unknown' source: a transactional-looking email from a KNOWN sender whose
-- subject matches no route (e.g. the bank rewords a notification). Staged as
-- status='error' so it is visible for review instead of silently dropped;
-- promote only processes 'pending' rows, so it can never book.
alter table email_movements drop constraint if exists email_movements_source_check;
alter table email_movements add constraint email_movements_source_check check (source in (
  'bancochile_tc', 'bancochile_pago', 'bancochile_transfer_out',
  'bancochile_transfer_in', 'bancochile_pago_tc',
  'bice_transfer_out', 'bice_transfer_in', 'bice_pago_tc',
  'mp_transfer_out', 'tenpo_transfer_in', 'bci_spa', 'unknown'
));

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
          -- Outgoing: SpA sent money to one of the user's personal accounts
          -- (hint = destination). The email does not carry the SpA account
          -- number, so this only works unambiguously with a single SpA
          -- debit/cash account — fail loudly otherwise.
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
        -- Late mirror: an own transfer already booked this money into this
        -- account (pair created in an earlier run, or recorded manually).
        -- Link instead of double-booking an income.
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

          -- Savings = expense on the origin account (user's convention: it
          -- counts in accumulated and in the ahorro bucket) + direct balance
          -- credit on the off-budget destination (patrimonio stays fresh).
          insert into transactions (user_id, account_id, type, amount, description, category, entity, date, metadata)
          values (p_user_id, v_account.id, 'expense', v_amount,
                  'Ahorro -> ' || v_dest.name, 'ahorro.inversion',
                  v_account.entity, coalesce(v_row.email_date::date, current_date), v_meta)
          returning * into v_tx;
          perform _update_account_balance(v_account.id, -v_amount);
          perform _update_account_balance(v_dest.id, v_amount);

        else
          -- Own transfer ONLY when the email names a destination account we
          -- can resolve to one of the user's own accounts. Amount + date
          -- coincidence alone is NOT proof.
          v_dest := null;
          if v_row.dest_hint is not null then
            v_dest := _match_account_by_hint(p_user_id, v_row.dest_hint, v_row.currency);
          end if;

          if v_dest.id is not null then
            -- Consume the pending mirror IN email sitting on that same
            -- account, if it already arrived (oldest first, deterministic).
            select m.* into v_mirror from email_movements m
            where m.user_id = p_user_id and m.status = 'pending'
              and m.id <> v_row.id
              and m.source like '%transfer_in'
              and m.amount = v_row.amount
              and abs(extract(epoch from (m.email_date - v_row.email_date))) <= 86400
              and (_match_account_by_hint(p_user_id, m.account_hint, m.currency)).id = v_dest.id
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
