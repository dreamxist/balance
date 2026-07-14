begin;
select plan(5);

-- Two credit cards sharing the same last4 (real case: TC Nacional/Internacional
-- BCH are the same physical card). currency disambiguates.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values ('c9000000-0000-0000-0000-000000000001', 'currency-a@example.com',
        crypt('password', gen_salt('bf')), now(), 'authenticated', 'authenticated',
        '00000000-0000-0000-0000-000000000000');

insert into accounts (id, user_id, name, type, subtype, entity, metadata) values
  ('c9200000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001',
   'TC Nacional BCH', 'liability', 'credit_card', 'personal',
   '{"card_last4": "1234", "card_currency": "CLP"}'),
  ('c9200000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000001',
   'TC Internacional BCH', 'liability', 'credit_card', 'personal',
   '{"card_last4": "1234", "card_currency": "USD"}');

select is(
  (select name from _match_account_by_hint(
    'c9000000-0000-0000-0000-000000000001', '1234', 'CLP')),
  'TC Nacional BCH',
  'CLP purchase matches the CLP-tagged card'
);

select is(
  (select name from _match_account_by_hint(
    'c9000000-0000-0000-0000-000000000001', '1234', 'USD')),
  'TC Internacional BCH',
  'USD purchase matches the USD-tagged card'
);

select ok(
  (select name from _match_account_by_hint(
    'c9000000-0000-0000-0000-000000000001', '1234', null)) is not null,
  'null currency still matches some card (fallback)'
);

-- End-to-end: a USD email promotes onto the USD card
insert into email_movements (user_id, gmail_message_id, source, amount, currency, merchant, account_hint, email_date)
values ('c9000000-0000-0000-0000-000000000001', 'gc1', 'bancochile_tc', 2379, 'USD', 'OPENAI', '1234', '2026-07-08 09:00+00');

select is(
  (promote_email_movements('c9000000-0000-0000-0000-000000000001', 900))->>'promoted',
  '1',
  'USD email promotes with an injected rate'
);

select is(
  (select account_id from transactions where metadata->>'gmail_message_id' = 'gc1'),
  'c9200000-0000-0000-0000-000000000002'::uuid,
  'promoted USD purchase lands on the USD-tagged card'
);

select * from finish();
rollback;
