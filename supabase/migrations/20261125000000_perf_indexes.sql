-- Migration: indexes for hot dashboard queries. Safe to re-run; no data changes.
-- "Last synced" lookup on every dashboard render (ad account + success + newest first).
CREATE INDEX IF NOT EXISTS idx_sync_logs_account_status_completed
    ON public.sync_logs (ad_account_id, status, completed_at DESC);
