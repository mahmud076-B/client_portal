-- Migration 0005_ad_accounts_metadata.sql

-- Add currency and timezone_name to ad_accounts table
-- The global UNIQUE constraint on meta_ad_account_id is kept intact
-- to ensure a Meta Ad Account is owned by exactly one Marketivity organization.

ALTER TABLE public.ad_accounts
ADD COLUMN IF NOT EXISTS currency TEXT,
ADD COLUMN IF NOT EXISTS timezone_name TEXT;
