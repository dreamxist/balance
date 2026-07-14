begin;
select plan(6);

-- Real-world scenario: SpA pays Juan into his personal Mercado Pago
-- (outgoing BCI email, hint = destination MP account) and a client pays the
-- SpA (incoming, hint = SpA account). Plus pago TC internacional resolves to
-- the USD-tagged card.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('d5000000-0000-0000-0000-000000000001', 'bci-a@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity, metadata) values
  ('d5200000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
   'SpA BCI', 'asset', 'debit', 'spa', '{"bank_account_numbers": ["5566778899"]}'),
  ('d5200000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000001',
   'Mercado Pago', 'asset', 'debit', 'personal', '{"bank_account_numbers": ["9988776655"]}'),
  ('d5200000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000001',
   'CC Banco Chile', 'asset', 'debit', 'personal', '{"bank_account_numbers": ["1122334455"]}'),
  ('d5200000-0000-0000-0000-000000000004', 'd5000000-0000-0000-0000-000000000001',
   'TC Nacional BCH', 'liability', 'credit_card', 'personal',
   '{"card_last4": "1234", "card_currency": "CLP"}'),
  ('d5200000-0000-0000-0000-000000000005', 'd5000000-0000-0000-0000-000000000001',
   'TC Internacional BCH', 'liability', 'credit_card', 'personal',
   '{"card_last4": "1234", "card_currency": "USD"}');

insert into email_movements (user_id, gmail_message_id, source, amount, currency, counterparty, account_hint, email_date) values
  ('d5000000-0000-0000-0000-000000000001', 'bd1', 'bci_spa', 60173, 'CLP',
   'Juan Perez', '9988776655', '2026-07-01 19:09+00'),
  ('d5000000-0000-0000-0000-000000000001', 'bd2', 'bci_spa', 500000, 'CLP',
   'CLIENTE LTDA', '5566778899', '2026-07-02 10:00+00'),
  ('d5000000-0000-0000-0000-000000000001', 'bd3', 'bancochile_pago_tc', 518612, 'CLP',
   'TC Internacional', '1234', '2026-07-02 12:00+00');

select is(
  (promote_email_movements('d5000000-0000-0000-0000-000000000001', null))->>'promoted',
  '3',
  'all three BCI/pago movements promote'
);

-- Outgoing SpA -> personal MP: inter-entity transfer pair, never income
select is(
  (select count(*)::bigint from transactions
    where type = 'transfer' and abs(amount) = 60173),
  2::bigint,
  'SpA payout to own personal account books as transfer pair'
);

select is(
  (select balance from accounts where id = 'd5200000-0000-0000-0000-000000000002'),
  60173::bigint,
  'Mercado Pago receives the SpA payout'
);

-- Incoming to SpA: income NULL, entity spa
select is(
  (select type::text || '/' || coalesce(category, 'NULL') || '/' || entity::text
     from transactions where metadata->>'gmail_message_id' = 'bd2'),
  'income/NULL/spa',
  'client payment into SpA stays income NULL entity spa'
);

-- Pago TC internacional prefers the USD-tagged card as destination
select is(
  (select count(*)::bigint from transactions
    where type = 'transfer' and amount = 518612
      and account_id = 'd5200000-0000-0000-0000-000000000005'),
  1::bigint,
  'pago TC internacional lands on the USD-tagged card'
);

select is(
  (select balance from accounts where id = 'd5200000-0000-0000-0000-000000000004'),
  0::bigint,
  'the CLP card is untouched by the internacional payment'
);

select * from finish();
rollback;
