-- Sync health: every gmail-sync / fintoc-sync run records its outcome, so a
-- broken source (revoked OAuth client, bank login_required) shows up in
-- `bal balance` instead of failing silently inside a cron that discards the
-- response. Written by the edge functions with service role; the owner reads
-- them through the existing sync_state select policy.

alter table sync_state
  add column gmail_last_success_at timestamptz,
  add column gmail_last_error text,
  add column gmail_last_error_at timestamptz,
  add column fintoc_last_success_at timestamptz,
  add column fintoc_last_error text,
  add column fintoc_last_error_at timestamptz;

-- The watermark only advances on a clean run: it is the last known success.
update sync_state set gmail_last_success_at = gmail_watermark
where gmail_watermark is not null;
