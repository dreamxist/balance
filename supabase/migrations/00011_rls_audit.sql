-- ============================================================
-- RLS: transactions (SEC-01, D-02, TXNS-07)
-- ============================================================
alter table transactions enable row level security;

-- Read own transactions only
create policy "transactions_select" on transactions
  for select using ((select auth.uid()) = user_id);

-- Insert own transactions only (via DB functions)
create policy "transactions_insert" on transactions
  for insert with check ((select auth.uid()) = user_id);

-- NO UPDATE policy: transactions are immutable (D-02, TXNS-07)
-- NO DELETE policy: transactions are immutable (D-02, TXNS-07)

-- ============================================================
-- RLS: audit_log (SEC-01, D-06 — append-only)
-- ============================================================
alter table audit_log enable row level security;

-- Users can read their own audit entries
create policy "audit_log_select" on audit_log
  for select using ((select auth.uid()) = user_id);

-- No INSERT policy for regular users (trigger function uses security definer)
-- No UPDATE policy: append-only (D-06)
-- No DELETE policy: append-only (D-06)

-- ============================================================
-- Audit triggers on financial tables (D-05, SEC-04)
-- ============================================================

-- accounts: track all changes
create trigger audit_accounts
  after insert or update or delete on accounts
  for each row execute function audit_trigger_fn();

-- transactions: track inserts only (only operation allowed per immutability)
create trigger audit_transactions
  after insert on transactions
  for each row execute function audit_trigger_fn();

-- categories: track changes to user categories
create trigger audit_categories
  after insert or update or delete on categories
  for each row execute function audit_trigger_fn();
