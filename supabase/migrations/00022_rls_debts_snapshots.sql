-- ============================================================
-- RLS: debts (SEC-01)
-- ============================================================
alter table debts enable row level security;

-- Read own debts only
create policy "debts_select" on debts
  for select using ((select auth.uid()) = user_id);

-- Insert own debts only (via DB functions)
create policy "debts_insert" on debts
  for insert with check ((select auth.uid()) = user_id);

-- Update own debts (status changes via archive_debt, pay_off_debt)
create policy "debts_update" on debts
  for update using ((select auth.uid()) = user_id);

-- No DELETE policy: debts use status = 'archived', never delete

-- ============================================================
-- Snapshots RLS already enabled in 00019_snapshots.sql
-- (SELECT + INSERT only, no UPDATE/DELETE per D-11 immutability)
-- ============================================================

-- ============================================================
-- Audit triggers (D-05, SEC-04)
-- ============================================================

-- debts: track inserts and updates (status changes)
create trigger audit_debts
  after insert or update on debts
  for each row execute function audit_trigger_fn();

-- snapshots: track inserts only (immutable per D-11)
create trigger audit_snapshots
  after insert on snapshots
  for each row execute function audit_trigger_fn();
