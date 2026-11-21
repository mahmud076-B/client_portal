-- Migration: campaign_events (Live Updates feed + AI assistant context)
-- Rows are written ONLY by the server-side sync job (service role).
-- Clients may read events for campaigns assigned to them; admins may read
-- events for their organization. No INSERT/UPDATE/DELETE policies exist, so
-- authenticated users cannot write to this table.

CREATE TABLE IF NOT EXISTS public.campaign_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'status_changed',
        'campaign_completed',
        'new_results',
        'spend_milestone',
        'budget_milestone'
    )),
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning')),
    title TEXT NOT NULL,
    body TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Idempotency key so re-running a sync never duplicates an event.
    dedupe_key TEXT NOT NULL UNIQUE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign_time
    ON public.campaign_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_events_org_time
    ON public.campaign_events (organization_id, occurred_at DESC);

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read assigned campaign events" ON public.campaign_events;
CREATE POLICY "Clients can read assigned campaign events" ON public.campaign_events
    FOR SELECT USING (
        campaign_id IN (
            SELECT campaign_id FROM public.campaign_assignments
            WHERE client_id = public.get_auth_client_id()
        )
    );

DROP POLICY IF EXISTS "Admins can read org campaign events" ON public.campaign_events;
CREATE POLICY "Admins can read org campaign events" ON public.campaign_events
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    );

-- Enable Supabase Realtime for INSERTs (RLS above still applies to subscribers).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaign_events'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_events;
    END IF;
END $$;
