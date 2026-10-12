-- Apple Pay ingestion. An iOS Shortcut (Wallet "Transaction" automation)
-- posts card, merchant and amount to the wallet-ingest edge function, which
-- calls ingest_wallet_payment. The card is mapped to an account (learned in
-- accounts.metadata.wallet_cards) and the purchase is booked right away.
-- Banks that also notify the same purchase (Gmail for credit cards, Fintoc for
-- the checking account) are deduplicated both ways: Apple Pay claims an
-- already-booked bank expense, and promote_email_movements claims an
-- Apple Pay expense instead of inserting a second one.

alter table email_movements drop constraint if exists email_movements_source_check;
alter table email_movements add constraint email_movements_source_check check (source in (
  'bancochile_tc', 'bancochile_pago', 'bancochile_transfer_out',
  'bancochile_transfer_in', 'bancochile_pago_tc',
  'bice_transfer_out', 'bice_transfer_in', 'bice_pago_tc',
  'mp_transfer_out', 'tenpo_transfer_in', 'bci_spa', 'unknown', 'apple_pay'
));

-- Account for a Wallet card name: an explicit mapping first, then a bank +
-- debit/credit guess that must resolve to exactly one account.
create or replace function _wallet_account(p_user_id uuid, p_card text)
returns accounts as $$
declare
  v_account accounts;
  v_bank text;
  v_subtype account_subtype;
  v_count int;
begin
  select a.* into v_account from accounts a
  where a.user_id = p_user_id
    and not a.is_archived
    and exists (
      select 1 from jsonb_array_elements_text(coalesce(a.metadata->'wallet_cards', '[]'::jsonb)) c
      where lower(c) = lower(trim(p_card))
    )
  limit 1;
  if v_account.id is not null then
    return v_account;
  end if;

  v_bank := case
    when p_card ~* 'bice' then 'bice'
    when p_card ~* 'chile|bch|edwards' then 'chile'
  end;
  if v_bank is null then
    return null;
  end if;
  v_subtype := case when p_card ~* 'd[eé]bito|debit' then 'debit' else 'credit_card' end;

  select count(*) into v_count from accounts a
  where a.user_id = p_user_id and not a.is_archived and a.on_budget
    and a.subtype = v_subtype
    and (case v_bank when 'bice' then a.name ~* 'bice' else a.name ~* 'chile|bch' end)
    and a.name !~* 'internacional';
  if v_count <> 1 then
    return null;
  end if;

  select a.* into v_account from accounts a
  where a.user_id = p_user_id and not a.is_archived and a.on_budget
    and a.subtype = v_subtype
    and (case v_bank when 'bice' then a.name ~* 'bice' else a.name ~* 'chile|bch' end)
    and a.name !~* 'internacional';

  update accounts
  set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb), '{wallet_cards}',
    coalesce(metadata->'wallet_cards', '[]'::jsonb) || to_jsonb(trim(p_card))
  )
  where id = v_account.id;

  return v_account;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ingest_wallet_payment(
  p_user_id uuid,
  p_card text,
  p_merchant text,
  p_amount bigint,
  p_occurred_at timestamptz default now()
) returns jsonb as $$
declare
  v_id text;
  v_account accounts;
  v_date date := (p_occurred_at at time zone 'America/Santiago')::date;
  v_existing uuid;
  v_category text;
  v_tx transactions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be a positive CLP integer' using errcode = '22023';
  end if;

  v_id := 'applepay:' || md5(
    p_user_id::text || '|' || lower(trim(coalesce(p_card, ''))) || '|' ||
    lower(trim(coalesce(p_merchant, ''))) || '|' || p_amount || '|' ||
    to_char(date_trunc('minute', p_occurred_at), 'YYYY-MM-DD"T"HH24:MI')
  );
  if exists (select 1 from email_movements where gmail_message_id = v_id) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  v_account := _wallet_account(p_user_id, coalesce(p_card, ''));
  if v_account.id is null then
    insert into email_movements (user_id, gmail_message_id, source, amount, currency,
      merchant, account_hint, email_date, status, error_detail)
    values (p_user_id, v_id, 'apple_pay', p_amount, 'CLP', p_merchant, p_card,
      p_occurred_at, 'error', 'tarjeta de Wallet sin cuenta asignada: ' || coalesce(p_card, ''));
    return jsonb_build_object('status', 'unmapped', 'card', p_card);
  end if;

  -- The bank already notified this purchase: link to it.
  select t.id into v_existing from transactions t
  where t.user_id = p_user_id
    and t.account_id = v_account.id
    and t.type = 'expense'
    and t.amount = p_amount
    and coalesce(t.metadata->>'source', '') <> 'apple_pay'
    and t.metadata ? 'gmail_message_id'
    and t.date between v_date - 1 and v_date + 3
    and not exists (
      select 1 from email_movements m
      where m.transaction_id = t.id and m.source = 'apple_pay'
    )
  order by abs(t.date - v_date)
  limit 1;
  if v_existing is not null then
    insert into email_movements (user_id, gmail_message_id, source, amount, currency,
      merchant, account_hint, email_date, status, transaction_id)
    values (p_user_id, v_id, 'apple_pay', p_amount, 'CLP', p_merchant, p_card,
      p_occurred_at, 'promoted', v_existing);
    return jsonb_build_object('status', 'linked', 'transaction_id', v_existing,
      'account', v_account.name);
  end if;

  select r.category into v_category from categorization_rules r
  where r.user_id = p_user_id
    and position(upper(r.pattern) in upper(coalesce(p_merchant, ''))) > 0
  order by r.priority desc, r.created_at asc
  limit 1;

  insert into transactions (user_id, account_id, type, amount, description, category,
    entity, date, metadata)
  values (p_user_id, v_account.id, 'expense', p_amount, coalesce(nullif(trim(p_merchant), ''), 'Compra'),
    v_category, v_account.entity, v_date,
    jsonb_build_object('source', 'apple_pay', 'gmail_message_id', v_id, 'wallet_card', p_card))
  returning * into v_tx;
  perform _update_account_balance(v_account.id, -p_amount);

  insert into email_movements (user_id, gmail_message_id, source, amount, currency,
    merchant, account_hint, email_date, status, transaction_id)
  values (p_user_id, v_id, 'apple_pay', p_amount, 'CLP', p_merchant, p_card,
    p_occurred_at, 'promoted', v_tx.id);

  return jsonb_build_object('status', 'booked', 'transaction_id', v_tx.id,
    'account', v_account.name, 'category', v_category);
end;
$$ language plpgsql security definer set search_path = public;

-- Map a Wallet card name to an account and book the payments that were
-- waiting for that mapping.
create or replace function link_wallet_card(p_card text, p_account_id uuid)
returns jsonb as $$
declare
  v_uid uuid := (select auth.uid());
  v_account accounts;
  v_row email_movements;
  v_booked int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_account from accounts
  where id = p_account_id and user_id = v_uid and not is_archived;
  if v_account.id is null then
    raise exception 'account not found' using errcode = '22023';
  end if;
  if coalesce(trim(p_card), '') = '' then
    raise exception 'card is required' using errcode = '22023';
  end if;

  update accounts a
  set metadata = jsonb_set(
    coalesce(a.metadata, '{}'::jsonb), '{wallet_cards}',
    coalesce(a.metadata->'wallet_cards', '[]'::jsonb) || to_jsonb(trim(p_card))
  )
  where a.id = v_account.id
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(a.metadata->'wallet_cards', '[]'::jsonb)) c
      where lower(c) = lower(trim(p_card))
    );

  for v_row in
    select * from email_movements
    where user_id = v_uid and source = 'apple_pay' and status = 'error'
      and lower(account_hint) = lower(trim(p_card))
    order by email_date
  loop
    delete from email_movements where id = v_row.id;
    perform ingest_wallet_payment(v_uid, v_row.account_hint, v_row.merchant, v_row.amount, v_row.email_date);
    v_booked := v_booked + 1;
  end loop;

  return jsonb_build_object('card', trim(p_card), 'account', v_account.name, 'booked', v_booked);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function link_wallet_card(text, uuid) from public, anon;
grant execute on function link_wallet_card(text, uuid) to authenticated;

-- Called only by the wallet-ingest edge function, which resolves p_user_id
-- from the API key; users must not be able to book for someone else.
revoke all on function _wallet_account(uuid, text) from public, anon, authenticated;
revoke all on function ingest_wallet_payment(uuid, text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function ingest_wallet_payment(uuid, text, text, bigint, timestamptz) to service_role;

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

      -- A purchase already booked from Apple Pay in real time: claim it
      -- instead of booking the same expense twice.
      if v_row.source in ('bancochile_tc', 'bancochile_pago') then
        select t.id into v_existing_tx_id from transactions t
        where t.user_id = p_user_id
          and t.account_id = v_account.id
          and t.type = 'expense'
          and t.amount = v_amount
          and t.metadata->>'source' = 'apple_pay'
          and t.date between coalesce(v_row.email_date::date, current_date) - 3
                         and coalesce(v_row.email_date::date, current_date) + 1
          and not exists (
            select 1 from email_movements m
            where m.transaction_id = t.id and m.source <> 'apple_pay'
          )
        order by abs(t.date - coalesce(v_row.email_date::date, current_date)), t.created_at
        limit 1;
        if v_existing_tx_id is not null then
          update email_movements
          set status = 'promoted', transaction_id = v_existing_tx_id
          where id = v_row.id;
          v_skipped := v_skipped + 1;
          continue;
        end if;
      end if;

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
            select t.id into v_existing_tx_id from transactions t
            where t.user_id = p_user_id
              and t.account_id = v_account.id
              and t.type = 'transfer'
              and t.transfer_to = v_dest.id
              and t.amount = -v_amount
              and t.date between coalesce(v_row.email_date::date, current_date) - 1
                             and coalesce(v_row.email_date::date, current_date) + 1
              and not exists (select 1 from email_movements m where m.transaction_id = t.id)
            order by t.created_at
            limit 1;
            if v_existing_tx_id is not null then
              update email_movements
              set status = 'promoted', transaction_id = v_existing_tx_id
              where id = v_row.id;
              v_skipped := v_skipped + 1;
              continue;
            end if;

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

        -- Already booked by hand (or by another source): the same pair
        -- origin -> card, same amount, ±1 day, not yet claimed by a staged row.
        select t.id into v_existing_tx_id from transactions t
        where t.user_id = p_user_id
          and t.account_id = v_account.id
          and t.type = 'transfer'
          and t.transfer_to = v_dest.id
          and t.amount = -v_amount
          and t.date between coalesce(v_row.email_date::date, current_date) - 1
                         and coalesce(v_row.email_date::date, current_date) + 1
          and not exists (select 1 from email_movements m where m.transaction_id = t.id)
        order by t.created_at
        limit 1;
        if v_existing_tx_id is not null then
          update email_movements
          set status = 'promoted', transaction_id = v_existing_tx_id
          where id = v_row.id;
          v_skipped := v_skipped + 1;
          continue;
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

