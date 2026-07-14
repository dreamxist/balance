begin;
select plan(23);

-- ============================================================
-- Setup: user, accounts with email-matching metadata, rules, staging
-- ============================================================
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('a7000000-0000-0000-0000-000000000001', 'promote-a@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity, on_budget, metadata) values
  ('a7200000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001',
   'Cuenta Corriente Banco de Chile', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["1122334455"]}'),
  ('a7200000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000001',
   'TC Banco de Chile', 'liability', 'credit_card', 'personal', true,
   '{"card_last4": "1234"}'),
  ('a7200000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000001',
   'Cuenta Corriente BICE', 'asset', 'debit', 'personal', true,
   '{"bank_account_numbers": ["7654321"]}'),
  ('a7200000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000001',
   'Fintual Inversiones', 'asset', 'investment', 'personal', false, '{}'),
  ('a7200000-0000-0000-0000-000000000005', 'a7000000-0000-0000-0000-000000000001',
   'Cuenta BCI SpA', 'asset', 'debit', 'spa', true,
   '{"bank_account_numbers": ["779911"]}');

insert into categorization_rules (user_id, pattern, category, priority) values
  ('a7000000-0000-0000-0000-000000000001', 'CRUNCHYROLL', 'consumo.entretencion', 10),
  ('a7000000-0000-0000-0000-000000000001', 'CRUNCH', 'necesidad.salud', 1);

insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, merchant, account_hint, email_date, bank_tx_id) values
  ('a7000000-0000-0000-0000-000000000001', 'g1', 'bancochile_tc', 9900, 'CLP', null, 'CRUNCHYROLL MEMBERSHIP', '1234', '2026-07-01 10:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g2', 'bancochile_tc', 15000, 'CLP', null, 'TIENDA DESCONOCIDA', '1234', '2026-07-01 12:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g3', 'bancochile_transfer_out', 50000, 'CLP', 'JUAN PEREZ', null, '1122334455', '2026-07-02 09:00+00', 'TEF_123'),
  ('a7000000-0000-0000-0000-000000000001', 'g4', 'bancochile_transfer_out', 480000, 'CLP', 'FINTUAL AGF', null, '1122334455', '2026-07-03 09:00+00', 'TEF_456'),
  ('a7000000-0000-0000-0000-000000000001', 'g5', 'bancochile_transfer_out', 70000, 'CLP', 'JUAN PEREZ SOTO', null, '1122334455', '2026-07-04 10:00+00', 'TEF_789'),
  ('a7000000-0000-0000-0000-000000000001', 'g6', 'bice_transfer_in', 70000, 'CLP', 'JUAN PEREZ SOTO', null, '7654321', '2026-07-04 11:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g7', 'bancochile_transfer_in', 30000, 'CLP', 'PEDRO PAGADOR', null, '1122334455', '2026-07-05 09:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g8', 'bancochile_pago_tc', 100000, 'CLP', 'TC Nacional', null, '1122334455', '2026-07-06 09:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g9', 'bci_spa', 500000, 'CLP', 'CLIENTE SPA', null, '779911', '2026-07-07 09:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g10', 'bancochile_tc', 2379, 'USD', null, 'OPENAI', '1234', '2026-07-08 09:00+00', null),
  ('a7000000-0000-0000-0000-000000000001', 'g11', 'bancochile_tc', 4000, 'CLP', null, 'SIN CUENTA', '9999', '2026-07-08 10:00+00', null);

-- ============================================================
-- Cron path requires p_user_id
-- ============================================================
select throws_ok(
  $$select promote_email_movements()$$,
  '22023',
  null,
  'cron path without p_user_id fails'
);

-- ============================================================
-- Run 1 (cron path, no usd rate)
-- ============================================================
select is(
  promote_email_movements('a7000000-0000-0000-0000-000000000001', null),
  '{"promoted": 9, "skipped_existing": 0, "pending": 1, "errors": 1}'::jsonb,
  'run 1 promotes 9, leaves USD pending, marks unmatched hint as error'
);

select is(
  (select category from transactions where metadata->>'gmail_message_id' = 'g1'),
  'consumo.entretencion',
  'rule with highest priority categorizes the TC purchase'
);

select is(
  (select category from transactions where metadata->>'gmail_message_id' = 'g2'),
  null,
  'unknown merchant stays uncategorized (NULL, never guessed)'
);

select is(
  (select type::text from transactions where metadata->>'gmail_message_id' = 'g3'),
  'expense',
  'outgoing transfer to third party becomes expense'
);

select is(
  (select category from transactions where metadata->>'gmail_message_id' = 'g4'),
  'ahorro.inversion',
  'transfer to Fintual is categorized ahorro.inversion'
);

select is(
  (select count(*)::bigint from transactions
    where type = 'transfer' and abs(amount) = 480000),
  2::bigint,
  'Fintual savings creates a transfer pair'
);

select is(
  (select count(*)::bigint from transactions
    where type = 'transfer' and abs(amount) = 70000),
  2::bigint,
  'mirror out/in emails collapse into one own-to-own transfer pair'
);

select is(
  (select count(*)::bigint from email_movements
    where gmail_message_id in ('g5', 'g6') and status = 'promoted' and transaction_id is not null),
  2::bigint,
  'both mirror staging rows are promoted with linked transactions'
);

select is(
  (select category from transactions where metadata->>'gmail_message_id' = 'g7'),
  null,
  'incoming third-party transfer is income with NULL category'
);

select is(
  (select type::text from transactions where metadata->>'gmail_message_id' = 'g7'),
  'income',
  'incoming transfer typed income'
);

select is(
  (select count(*)::bigint from transactions
    where type = 'transfer'
      and account_id = 'a7200000-0000-0000-0000-000000000002'
      and amount = 100000),
  1::bigint,
  'TC payment lands as transfer INTO the credit card account'
);

select is(
  (select entity::text from transactions where metadata->>'gmail_message_id' = 'g9'),
  'spa',
  'BCI email books against entity spa'
);

select is(
  (select status from email_movements where gmail_message_id = 'g10'),
  'pending',
  'USD movement without rate stays pending (not error)'
);

select alike(
  (select error_detail from email_movements where gmail_message_id = 'g11'),
  '%no account matches hint%',
  'unmatched account hint marks the row error with detail'
);

-- ============================================================
-- Run 2 with usd rate: only the USD row promotes
-- ============================================================
select is(
  promote_email_movements('a7000000-0000-0000-0000-000000000001', 900),
  '{"promoted": 1, "skipped_existing": 0, "pending": 0, "errors": 0}'::jsonb,
  'run 2 promotes only the USD row'
);

select is(
  (select amount from transactions where metadata->>'gmail_message_id' = 'g10'),
  21411::bigint,
  'USD converted to CLP with the injected rate (2379 cents * 900 / 100)'
);

select is(
  (select metadata->>'fx_estimated' from transactions where metadata->>'gmail_message_id' = 'g10'),
  'true',
  'converted USD purchase flags fx_estimated with original cents'
);

-- ============================================================
-- Run 3: idempotent, zero effect
-- ============================================================
select is(
  promote_email_movements('a7000000-0000-0000-0000-000000000001', 900),
  '{"promoted": 0, "skipped_existing": 0, "pending": 0, "errors": 0}'::jsonb,
  'run 3 is a no-op'
);

select is(
  (select count(*)::bigint from transactions where user_id = 'a7000000-0000-0000-0000-000000000001'),
  12::bigint,
  'transaction count stable across repeated runs'
);

-- ============================================================
-- Dedup: same bank_tx_id under a new gmail id links, does not duplicate
-- ============================================================
insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, account_hint, email_date, bank_tx_id)
values ('a7000000-0000-0000-0000-000000000001', 'g12', 'bancochile_transfer_out', 50000, 'CLP',
        'JUAN PEREZ', '1122334455', '2026-07-02 09:05+00', 'TEF_123');

select is(
  promote_email_movements('a7000000-0000-0000-0000-000000000001', null),
  '{"promoted": 0, "skipped_existing": 1, "pending": 0, "errors": 0}'::jsonb,
  'repeated bank_tx_id is skipped as existing'
);

select is(
  (select t.metadata->>'gmail_message_id'
     from email_movements m join transactions t on t.id = m.transaction_id
    where m.gmail_message_id = 'g12'),
  'g3',
  'duplicate staging row links to the original transaction'
);

-- ============================================================
-- Balances: primitives kept accounts consistent
-- ============================================================
select is(
  (select balance from accounts where id = 'a7200000-0000-0000-0000-000000000001'),
  (-740000)::bigint,
  'checking balance reflects all promoted movements'
);

select * from finish();
rollback;
