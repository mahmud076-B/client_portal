-- Migration 20261126000000: Live Updates attributed per (campaign, client) + RLS hardening.
--
-- Run ONCE in the Supabase SQL editor, immediately BEFORE merging the PR that ships
-- the matching code (event rows now carry client_id/event_key). Safe to re-run.
--
-- What it does
--  1. campaign_events: adds client_id (NOT NULL, FK) and event_key (NOT NULL).
--     Every row must belong to an existing (campaign, client) assignment and to that
--     client's organization, enforced by composite foreign keys.
--  2. Deletes the existing campaign_events rows: none of them has a client_id, so
--     they cannot be attributed. At 2026-11-22 01:59 Dhaka there were exactly 4, all
--     for "Velora Glow Ad (21$)", written 2026-11-21 19:01 UTC by the pre-fix generator:
--       d4cedec2-...  new_results  "+120 messaging conversations, +4 purchases, +10 page
--                     likes, +56 leads, +56 leads, +6 video thruplays" (every Meta action
--                     type mixed, leads counted twice, first sync announced as "new")
--       4710a9bf-...  performance_up "post engagements up 28%"          (wrong result type)
--       8e7b4b50-...  performance_up "Cost per engagement ... USD 0.00"  (wrong result type)
--       7ab7bfe2-...  performance_up "Click-through rate is up 23%"     (compared to a gap day)
--     Syncs that run before this migration (old code) add more client-less rows; they are
--     removed by the same statement. Nothing else is deleted. The next sync after the
--     deploy regenerates correct, attributed events.
--  3. Indexes for the feed: (client_id, campaign_id, occurred_at DESC).
--  4. RLS: every read policy on campaign_events, campaign_insights, campaigns,
--     clients and campaign_assignments is replaced with one scoped TO authenticated.
--     Client users see only their own client's rows (profiles.client_id ->
--     campaign_assignments); admins see their organization; anon sees nothing.
--     Writes to campaign_events / campaign_insights: service role only.
--  5. Helper functions become STABLE with a pinned search_path, and policies call
--     them as (select fn()) so Postgres evaluates them once per query, not per row.

BEGIN;

-- ---------------------------------------------------------------------------
-- 5. Helper functions (same names/signatures; STABLE + empty search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT client_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 1 + 2. campaign_events: client attribution
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_events ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.campaign_events ADD COLUMN IF NOT EXISTS event_key TEXT;

-- Rows without a client cannot be attributed (see header, point 2).
DELETE FROM public.campaign_events WHERE client_id IS NULL OR event_key IS NULL;

ALTER TABLE public.campaign_events ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE public.campaign_events ALTER COLUMN event_key SET NOT NULL;

-- Needed as the target of the (client_id, organization_id) foreign key below.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_id_organization_id_key') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_id_organization_id_key UNIQUE (id, organization_id);
  END IF;
END $$;

ALTER TABLE public.campaign_events DROP CONSTRAINT IF EXISTS campaign_events_client_fk;
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_client_fk
  FOREIGN KEY (client_id, organization_id) REFERENCES public.clients (id, organization_id) ON DELETE CASCADE;

-- The event's campaign must be assigned to the event's client. Unassigning removes the client's events.
ALTER TABLE public.campaign_events DROP CONSTRAINT IF EXISTS campaign_events_assignment_fk;
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_assignment_fk
  FOREIGN KEY (campaign_id, client_id) REFERENCES public.campaign_assignments (campaign_id, client_id) ON DELETE CASCADE;

-- One row per client per event; dedupe_key is derived, never free-form.
ALTER TABLE public.campaign_events DROP CONSTRAINT IF EXISTS campaign_events_dedupe_key_shape;
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_dedupe_key_shape CHECK (dedupe_key = client_id::text || ':' || event_key);
ALTER TABLE public.campaign_events DROP CONSTRAINT IF EXISTS campaign_events_event_key_campaign;
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_event_key_campaign CHECK (starts_with(event_key, campaign_id::text || ':'));
ALTER TABLE public.campaign_events DROP CONSTRAINT IF EXISTS campaign_events_title_nonempty;
ALTER TABLE public.campaign_events
  ADD CONSTRAINT campaign_events_title_nonempty CHECK (length(btrim(title)) > 0);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaign_events_client_campaign_time
  ON public.campaign_events (client_id, campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_assignments_client
  ON public.campaign_assignments (client_id, campaign_id);

-- ---------------------------------------------------------------------------
-- 4. Privileges: no anon access; feed/insights are written by the service role only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.campaign_events, public.campaign_insights, public.campaigns,
              public.clients, public.campaign_assignments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.campaign_events, public.campaign_insights FROM authenticated;
-- TRUNCATE bypasses RLS; nobody but the service role needs it.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.campaigns, public.clients, public.campaign_assignments FROM authenticated;
GRANT SELECT ON public.campaign_events, public.campaign_insights, public.campaigns,
               public.clients, public.campaign_assignments TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS policies (replace all read policies; recreate admin write policies TO authenticated)
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_assignments ENABLE ROW LEVEL SECURITY;

-- campaign_events
DROP POLICY IF EXISTS "Clients can read assigned campaign events" ON public.campaign_events;
DROP POLICY IF EXISTS "Admins can read org campaign events" ON public.campaign_events;
DROP POLICY IF EXISTS "events_select_own_client" ON public.campaign_events;
DROP POLICY IF EXISTS "events_select_org_admin" ON public.campaign_events;
CREATE POLICY "events_select_own_client" ON public.campaign_events
  FOR SELECT TO authenticated
  USING (client_id = (SELECT public.get_auth_client_id()));
CREATE POLICY "events_select_org_admin" ON public.campaign_events
  FOR SELECT TO authenticated
  USING ((SELECT public.is_org_admin()) AND organization_id = (SELECT public.get_auth_org_id()));

-- campaign_insights
DROP POLICY IF EXISTS "Clients can read assigned campaign insights" ON public.campaign_insights;
DROP POLICY IF EXISTS "Admins can read org campaign insights" ON public.campaign_insights;
DROP POLICY IF EXISTS "insights_select_own_client" ON public.campaign_insights;
DROP POLICY IF EXISTS "insights_select_org_admin" ON public.campaign_insights;
CREATE POLICY "insights_select_own_client" ON public.campaign_insights
  FOR SELECT TO authenticated
  USING (campaign_id IN (
    SELECT ca.campaign_id FROM public.campaign_assignments ca
    WHERE ca.client_id = (SELECT public.get_auth_client_id())
  ));
CREATE POLICY "insights_select_org_admin" ON public.campaign_insights
  FOR SELECT TO authenticated
  USING ((SELECT public.is_org_admin()) AND campaign_id IN (
    SELECT c.id FROM public.campaigns c
    JOIN public.ad_accounts a ON a.id = c.ad_account_id
    WHERE a.organization_id = (SELECT public.get_auth_org_id())
  ));

-- campaigns
DROP POLICY IF EXISTS "Clients can read assigned campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins can read org campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins can insert org campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins can update org campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_own_client" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_select_org_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert_org_admin" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update_org_admin" ON public.campaigns;
CREATE POLICY "campaigns_select_own_client" ON public.campaigns
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT ca.campaign_id FROM public.campaign_assignments ca
    WHERE ca.client_id = (SELECT public.get_auth_client_id())
  ));
CREATE POLICY "campaigns_select_org_admin" ON public.campaigns
  FOR SELECT TO authenticated
  USING ((SELECT public.is_org_admin()) AND ad_account_id IN (
    SELECT a.id FROM public.ad_accounts a WHERE a.organization_id = (SELECT public.get_auth_org_id())
  ));
CREATE POLICY "campaigns_insert_org_admin" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_org_admin()) AND ad_account_id IN (
    SELECT a.id FROM public.ad_accounts a WHERE a.organization_id = (SELECT public.get_auth_org_id())
  ));
CREATE POLICY "campaigns_update_org_admin" ON public.campaigns
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_org_admin()) AND ad_account_id IN (
    SELECT a.id FROM public.ad_accounts a WHERE a.organization_id = (SELECT public.get_auth_org_id())
  ))
  WITH CHECK ((SELECT public.is_org_admin()) AND ad_account_id IN (
    SELECT a.id FROM public.ad_accounts a WHERE a.organization_id = (SELECT public.get_auth_org_id())
  ));

-- clients
DROP POLICY IF EXISTS "Clients can read own client record" ON public.clients;
DROP POLICY IF EXISTS "Admins can read org clients" ON public.clients;
DROP POLICY IF EXISTS "clients_select_own" ON public.clients;
DROP POLICY IF EXISTS "clients_select_org_admin" ON public.clients;
CREATE POLICY "clients_select_own" ON public.clients
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_auth_client_id()));
CREATE POLICY "clients_select_org_admin" ON public.clients
  FOR SELECT TO authenticated
  USING ((SELECT public.is_org_admin()) AND organization_id = (SELECT public.get_auth_org_id()));

-- campaign_assignments
DROP POLICY IF EXISTS "Clients can read own assignments" ON public.campaign_assignments;
DROP POLICY IF EXISTS "Admins can read org assignments" ON public.campaign_assignments;
DROP POLICY IF EXISTS "Admins can insert org assignments" ON public.campaign_assignments;
DROP POLICY IF EXISTS "assignments_select_own_client" ON public.campaign_assignments;
DROP POLICY IF EXISTS "assignments_select_org_admin" ON public.campaign_assignments;
DROP POLICY IF EXISTS "assignments_insert_org_admin" ON public.campaign_assignments;
CREATE POLICY "assignments_select_own_client" ON public.campaign_assignments
  FOR SELECT TO authenticated
  USING (client_id = (SELECT public.get_auth_client_id()));
CREATE POLICY "assignments_select_org_admin" ON public.campaign_assignments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_org_admin()) AND client_id IN (
    SELECT cl.id FROM public.clients cl WHERE cl.organization_id = (SELECT public.get_auth_org_id())
  ));
-- (No campaign lookup here: avoids the RLS recursion fixed in 0007.)
CREATE POLICY "assignments_insert_org_admin" ON public.campaign_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_org_admin()) AND client_id IN (
    SELECT cl.id FROM public.clients cl WHERE cl.organization_id = (SELECT public.get_auth_org_id())
  ));

-- Realtime: campaign_events stays in supabase_realtime; subscribers get only rows their RLS allows.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaign_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_events;
  END IF;
END $$;

COMMIT;
