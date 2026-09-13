-- Migration: Step 3.5-B — Campaign Metadata Schema Completion
-- Adds lifetime_budget column to campaigns table.
-- All other required columns (status, effective_status, daily_budget, start_time, end_time) already exist.

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC(12,2) NULL;

COMMENT ON COLUMN public.campaigns.lifetime_budget IS 'Lifetime/total campaign budget in major currency units (e.g., dollars). Mutually exclusive with daily_budget. NULL when campaign uses daily budget.';
COMMENT ON COLUMN public.campaigns.daily_budget IS 'Daily campaign budget in major currency units (e.g., dollars). Mutually exclusive with lifetime_budget. NULL when campaign uses lifetime budget.';
COMMENT ON COLUMN public.campaigns.start_time IS 'Campaign start datetime as reported by Meta (start_time field).';
COMMENT ON COLUMN public.campaigns.end_time IS 'Campaign end datetime as reported by Meta (stop_time field). NULL means no end date (Ongoing).';
