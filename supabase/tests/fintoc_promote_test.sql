begin;
select plan(9);

-- ============================================================
-- Setup: checking account + national/international card on the same plastic
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('a9000000-0000-0000-0000-000000000001', 'fintoc-promote@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

insert into profiles (id, name) values
  ('a9000000-0000-0000-0000-000000000001', 'Juan Pérez Soto')
on conflict (id) do update set name = excluded.name;

insert into accounts (id, user_id, name, type, subtype, entity, on_budget, metadata) values
  ('a9200000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
   'CC Banco Chile', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["1122334455"]}'),
  ('a9200000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000001',
   'TC Nacional', 'liability', 'credit_card', 'personal', true,
   '{"card_last4": "1234", "card_currency": "CLP"}'),
  ('a9200000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-000000000001',
   'TC Internacional', 'liability', 'credit_card', 'personal', true,
   '{"card_last4": "1234", "card_currency": "USD"}'),
  ('a9200000-0000-0000-0000-000000000004', 'a9000000-0000-0000-0000-000000000001',
   'CC BICE', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["7654321"]}');

-- Hand-registered card payment and own transfer (what `bal transfer` books).
insert into transactions (user_id, account_id, type, amount, description, entity, date, transfer_to) values
  ('a9000000-0000-0000-0000-000000000001', 'a9200000-0000-0000-0000-000000000001', 'transfer',
   -150000, 'Pago TC Nacional', 'personal', '2026-10-02', 'a9200000-0000-0000-0000-000000000002'),
  ('a9000000-0000-0000-0000-000000000001', 'a9200000-0000-0000-0000-000000000002', 'transfer',
   150000, 'Pago TC Nacional', 'personal', '2026-10-02', 'a9200000-0000-0000-0000-000000000001'),
  ('a9000000-0000-0000-0000-000000000001', 'a9200000-0000-0000-0000-000000000001', 'transfer',
   -50000, 'A BICE', 'personal', '2026-10-04', 'a9200000-0000-0000-0000-000000000004'),
  ('a9000000-0000-0000-0000-000000000001', 'a9200000-0000-0000-0000-000000000004', 'transfer',
   50000, 'A BICE', 'personal', '2026-10-04', 'a9200000-0000-0000-0000-000000000001');

-- Fintoc rows: the same card payment one day later, the same own transfer,
-- an international card payment nobody registered, and a debit purchase.
insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, merchant, account_hint, dest_hint, email_date, bank_tx_id) values
  ('a9000000-0000-0000-0000-000000000001', 'fintoc:mov_1', 'bancochile_pago_tc', 150000, 'CLP',
   'TC Nacional', null, '1234', null, '2026-10-03 00:00+00', 'mov_1'),
  ('a9000000-0000-0000-0000-000000000001', 'fintoc:mov_2', 'bancochile_transfer_out', 50000, 'CLP',
   'Juan Perez Soto', null, '1122334455', '7654321', '2026-10-04 00:00+00', 'mov_2'),
  ('a9000000-0000-0000-0000-000000000001', 'fintoc:mov_3', 'bancochile_pago_tc', 45000, 'CLP',
   'TC Internacional', null, '1234', null, '2026-10-03 00:00+00', 'mov_3'),
  ('a9000000-0000-0000-0000-000000000001', 'fintoc:mov_4', 'bancochile_pago', 5000, 'CLP',
   null, 'cafe Ejemplo', '1122334455', null, '2026-10-05 00:00+00', 'mov_4');

select is(
  promote_email_movements('a9000000-0000-0000-0000-000000000001', null),
  '{"promoted": 2, "skipped_existing": 2, "pending": 0, "errors": 0}'::jsonb,
  'hand-registered payment and transfer are linked, the rest books'
);

select is(
  (select count(*)::bigint from transactions
    where user_id = 'a9000000-0000-0000-0000-000000000001'
      and type = 'transfer' and abs(amount) = 150000),
  2::bigint,
  'card payment registered by hand is not booked twice'
);

select is(
  (select t.description from email_movements m join transactions t on t.id = m.transaction_id
    where m.gmail_message_id = 'fintoc:mov_1'),
  'Pago TC Nacional',
  'staged card payment links to the hand-registered leg'
);

select is(
  (select count(*)::bigint from transactions
    where user_id = 'a9000000-0000-0000-0000-000000000001'
      and type = 'transfer' and abs(amount) = 50000),
  2::bigint,
  'own transfer registered by hand is not booked twice'
);

select is(
  (select transfer_to from transactions where metadata->>'gmail_message_id' = 'fintoc:mov_3'),
  'a9200000-0000-0000-0000-000000000003'::uuid,
  'unregistered international payment books against the USD card'
);

select is(
  (select type::text || ':' || amount from transactions where metadata->>'gmail_message_id' = 'fintoc:mov_4'),
  'expense:5000',
  'debit purchase books as expense'
);

select is(
  (select metadata->>'bank_tx_id' from transactions where metadata->>'gmail_message_id' = 'fintoc:mov_4'),
  'mov_4',
  'Fintoc movement id is kept as bank_tx_id'
);

-- A second identical payment in the window must NOT reuse the claimed leg.
insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, account_hint, email_date, bank_tx_id) values
  ('a9000000-0000-0000-0000-000000000001', 'fintoc:mov_5', 'bancochile_pago_tc', 150000, 'CLP',
   'TC Nacional', '1234', '2026-10-03 00:00+00', 'mov_5');

select is(
  promote_email_movements('a9000000-0000-0000-0000-000000000001', null),
  '{"promoted": 1, "skipped_existing": 0, "pending": 0, "errors": 0}'::jsonb,
  'a leg already claimed by a staged row is not linked again'
);

-- Re-staging the same movement id is idempotent via bank_tx_id.
insert into email_movements (user_id, gmail_message_id, source, amount, currency, merchant, account_hint, email_date, bank_tx_id) values
  ('a9000000-0000-0000-0000-000000000001', 'fintoc:mov_4b', 'bancochile_pago', 5000, 'CLP',
   'cafe Ejemplo', '1122334455', '2026-10-05 00:00+00', 'mov_4');

select is(
  (promote_email_movements('a9000000-0000-0000-0000-000000000001', null)->>'skipped_existing')::int,
  1,
  'same bank_tx_id never books twice'
);

select * from finish();
rollback;
