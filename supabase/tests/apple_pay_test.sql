begin;
select plan(18);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('a8000000-0000-0000-0000-000000000001', 'wallet-a@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity, on_budget, metadata, balance) values
  ('a8200000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001',
   'CC Banco Chile', 'asset', 'debit', 'personal', true, '{"bank_account_numbers": ["1122334455"]}', 100000),
  ('a8200000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000001',
   'TC Nacional BCH', 'liability', 'credit_card', 'personal', true, '{"card_last4": "1234", "card_currency": "CLP"}', 0),
  ('a8200000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-000000000001',
   'TC Internacional BCH', 'liability', 'credit_card', 'personal', true, '{"card_last4": "1234", "card_currency": "USD"}', 0),
  ('a8200000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000001',
   'TC Nacional BICE', 'liability', 'credit_card', 'personal', true, '{}', 0);

insert into categorization_rules (user_id, pattern, category, priority) values
  ('a8000000-0000-0000-0000-000000000001', 'CAFE', 'consumo.comida', 5);

-- ============================================================
-- BICE credit card: guessed, booked, learned, idempotent
-- ============================================================
select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'BICE Visa', 'Cafe Central',
    4500, '2026-10-10 15:00+00')->>'status',
  'booked',
  'unmapped BICE credit card is guessed and booked'
);

select is(
  (select balance from accounts where id = 'a8200000-0000-0000-0000-000000000004'),
  -4500::bigint,
  'credit card balance goes down by the purchase'
);

select is(
  (select category from transactions where account_id = 'a8200000-0000-0000-0000-000000000004'),
  'consumo.comida',
  'categorization rules apply to the merchant'
);

select ok(
  (select metadata->'wallet_cards' ? 'BICE Visa' from accounts where id = 'a8200000-0000-0000-0000-000000000004'),
  'the card name is learned on the account'
);

select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'BICE Visa', 'Cafe Central',
    4500, '2026-10-10 15:00:30+00')->>'status',
  'duplicate',
  'the same payment within the minute is ignored'
);

-- ============================================================
-- Banco de Chile: debit vs credit, international excluded
-- ============================================================
select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'Banco de Chile Débito', 'Farmacia',
    7000, '2026-10-10 16:00+00')->>'account',
  'CC Banco Chile',
  'a debit card maps to the checking account'
);

select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'Banco de Chile Visa', 'Tienda',
    12000, '2026-10-10 17:00+00')->>'account',
  'TC Nacional BCH',
  'a credit card maps to the national card, never the international one'
);

-- ============================================================
-- Unknown card: staged as an error, nothing booked
-- ============================================================
select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'Tarjeta Rara', 'Algo',
    1000, '2026-10-10 18:00+00')->>'status',
  'unmapped',
  'a card that matches no account is not booked'
);

select is(
  (select status from email_movements where account_hint = 'Tarjeta Rara'),
  'error',
  'the unmapped payment stays visible for review'
);

set local request.jwt.claims to '{"sub":"a8000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (link_wallet_card('Tarjeta Rara', 'a8200000-0000-0000-0000-000000000004')->>'booked')::int,
  1,
  'linking a card books the payments waiting for it'
);

select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'tarjeta rara', 'Otra',
    2000, '2026-10-10 19:00+00')->>'account',
  'TC Nacional BICE',
  'the linked card name maps case-insensitively from then on'
);

-- ============================================================
-- Apple Pay first, bank email later: the email claims it
-- ============================================================
insert into email_movements (user_id, gmail_message_id, source, amount, currency, merchant, account_hint, email_date)
values ('a8000000-0000-0000-0000-000000000001', 'mail-1', 'bancochile_tc', 12000, 'CLP', 'TIENDA', '1234', '2026-10-10 17:05+00');

select is(
  (promote_email_movements('a8000000-0000-0000-0000-000000000001')->>'skipped_existing')::int,
  1,
  'the bank email links to the Apple Pay expense'
);

select is(
  (select count(*) from transactions where account_id = 'a8200000-0000-0000-0000-000000000002'),
  1::bigint,
  'only one expense exists on the national card'
);

-- ============================================================
-- Bank email first, Apple Pay later: Apple Pay links
-- ============================================================
insert into email_movements (user_id, gmail_message_id, source, amount, currency, merchant, account_hint, email_date)
values ('a8000000-0000-0000-0000-000000000001', 'mail-2', 'bancochile_tc', 8000, 'CLP', 'BENCINA', '1234', '2026-10-11 12:00+00');
select promote_email_movements('a8000000-0000-0000-0000-000000000001');

select is(
  ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'Banco de Chile Visa', 'Copec',
    8000, '2026-10-11 11:58+00')->>'status',
  'linked',
  'Apple Pay links to the expense the bank already booked'
);

select is(
  (select count(*) from transactions where account_id = 'a8200000-0000-0000-0000-000000000002'),
  2::bigint,
  'no extra expense after linking'
);

select is(
  (select balance from accounts where id = 'a8200000-0000-0000-0000-000000000002'),
  -20000::bigint,
  'card balance counts each purchase once'
);

-- ============================================================
-- Security
-- ============================================================
select ok(
  not has_function_privilege('authenticated', 'ingest_wallet_payment(uuid, text, text, bigint, timestamptz)', 'execute'),
  'users cannot call ingest_wallet_payment directly'
);

select throws_ok(
  $$select ingest_wallet_payment('a8000000-0000-0000-0000-000000000001', 'BICE Visa', 'X', 0)$$,
  '22023',
  null,
  'a non-positive amount is rejected'
);

select * from finish();
rollback;
