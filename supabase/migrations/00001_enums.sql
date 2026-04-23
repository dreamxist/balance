-- All enum types used across the Balance schema
create type entity_type as enum ('personal', 'spa');
create type account_type as enum ('asset', 'liability');
create type account_subtype as enum (
  'debit', 'cash', 'credit_card', 'receivable', 'payable', 'investment', 'property'
);
create type transaction_type as enum (
  'income', 'expense', 'refund', 'transfer', 'debt_payment', 'adjustment'
);
create type debt_status as enum ('active', 'paid', 'archived');
create type snapshot_status as enum ('balanced', 'unbalanced');
create type invoice_status as enum ('draft', 'sent', 'paid', 'partially_paid', 'overdue');
