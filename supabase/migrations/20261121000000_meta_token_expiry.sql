-- Track Meta long-lived token expiry so the UI can warn before/after it lapses.
ALTER TABLE public.meta_connections
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
