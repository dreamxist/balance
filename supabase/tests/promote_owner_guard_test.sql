begin;
select plan(8);

-- ============================================================
-- Setup: user WITH profile name — mirror links must prove identity
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('a8000000-0000-0000-0000-000000000001', 'owner-guard@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

insert into profiles (id, name) values
  ('a8000000-0000-0000-0000-000000000001', 'Juan Pérez Soto')
on conflict (id) do update set name = excluded.name;

insert into accounts (id, user_id, name, type, subtype, entity, on_budget, metadata) values
  ('a8200000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001',
   'Cuenta Corriente Banco de Chile', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["1122334455"]}'),
  ('a8200000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000001',
   'Cuenta Corriente BICE', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["7654321"]}'),
  ('a8200000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-000000000001',
   'Mercado Pago', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["5566778899"]}');

-- Run 1: own transfer OUT (proven by dest_hint) plus a THIRD-PARTY income of
-- the same amount on the same destination account, same day. The consume path
-- must NOT absorb the client payment.
insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, account_hint, dest_hint, email_date) values
  ('a8000000-0000-0000-0000-000000000001', 'og1', 'mp_transfer_out', 90000, 'CLP',
   'Juan Perez Soto', '5566778899', '7654321', '2026-07-10 10:00+00'),
  ('a8000000-0000-0000-0000-000000000001', 'og2', 'bice_transfer_in', 90000, 'CLP',
   'CLIENTE AJENO LTDA', '7654321', null, '2026-07-10 11:00+00');

select is(
  promote_email_movements('a8000000-0000-0000-0000-000000000001', null),
  '{"promoted": 2, "skipped_existing": 0, "pending": 0, "errors": 0}'::jsonb,
  'own transfer and third-party income promote independently'
);

select is(
  (select count(*)::bigint from transactions
    where user_id = 'a8000000-0000-0000-0000-000000000001'
      and type = 'transfer' and abs(amount) = 90000),
  2::bigint,
  'the proven own transfer books its pair'
);

select is(
  (select type::text from transactions where metadata->>'gmail_message_id' = 'og2'),
  'income',
  'same-amount same-day client payment books as income, never absorbed as mirror'
);

-- Run 2: the REAL mirror arrives late — sender is the owner, so it links.
insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, account_hint, email_date) values
  ('a8000000-0000-0000-0000-000000000001', 'og3', 'bice_transfer_in', 90000, 'CLP',
   'Juan Perez Soto', '7654321', '2026-07-10 12:00+00');

select is(
  promote_email_movements('a8000000-0000-0000-0000-000000000001', null),
  '{"promoted": 0, "skipped_existing": 1, "pending": 0, "errors": 0}'::jsonb,
  'owner-named late mirror links to the existing transfer leg'
);

select is(
  (select count(*)::bigint from transactions
    where user_id = 'a8000000-0000-0000-0000-000000000001' and type = 'income'),
  1::bigint,
  'no duplicate income for the owner-named mirror'
);

select is(
  (select t.type::text from email_movements m join transactions t on t.id = m.transaction_id
    where m.gmail_message_id = 'og3'),
  'transfer',
  'late mirror links to the transfer in-leg'
);

-- Run 3: degenerate self-transfer (dest_hint = origin account) books as
-- expense, never a canceling pair.
insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, account_hint, dest_hint, email_date) values
  ('a8000000-0000-0000-0000-000000000001', 'og4', 'bancochile_transfer_out', 40000, 'CLP',
   'Juan Perez', '1122334455', '1122334455', '2026-07-11 09:00+00');

select is(
  (select promote_email_movements('a8000000-0000-0000-0000-000000000001', null)->>'promoted')::int,
  1,
  'self-transfer promotes'
);

select is(
  (select array[type::text, (select count(*) from transactions
      where user_id = 'a8000000-0000-0000-0000-000000000001'
        and type = 'transfer' and abs(amount) = 40000)::text]
     from transactions where metadata->>'gmail_message_id' = 'og4'),
  array['expense', '0'],
  'dest_hint equal to origin books an expense, no canceling pair'
);

select * from finish();
rollback;
