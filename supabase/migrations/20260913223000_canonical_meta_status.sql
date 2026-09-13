-- Migration to normalize meta_connections status to canonical 'connected'

-- 1. Update any existing active rows to connected
UPDATE public.meta_connections
SET status = 'connected'
WHERE status = 'active';

-- 2. Change the default value for the status column
ALTER TABLE public.meta_connections
ALTER COLUMN status SET DEFAULT 'connected';
