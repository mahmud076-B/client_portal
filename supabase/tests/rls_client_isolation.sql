-- RLS isolation check (read-only; changes nothing).
--
-- For EVERY client user in public.profiles, impersonates that user exactly like
-- PostgREST/Realtime do (role "authenticated" + JWT claims) and asserts that they
-- can see ONLY their own client's clients/campaigns/insights/events rows. Then checks
-- that admins see only their organization, but ALL of it (ad accounts, campaigns
-- including unassigned ones, clients, the Meta connection), and that anon sees nothing.
-- Raises an exception (and the transaction aborts) on the first violation.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role:
--   \i supabase/tests/rls_client_isolation.sql
-- Works before and after migration 20261126000000.

BEGIN READ ONLY;

DO $$
DECLARE
  u RECORD;
  users JSONB;
  own UUID[];
  org_campaigns UUID[];
  exp_accounts BIGINT; exp_campaigns BIGINT; exp_unassigned BIGINT; exp_clients BIGINT; exp_conn BIGINT;
  n BIGINT;
  checked INT := 0;
BEGIN
  -- Collected as postgres before switching roles.
  SELECT jsonb_agg(jsonb_build_object('uid', p.auth_user_id, 'role', p.role, 'client', p.client_id, 'org', p.organization_id))
    INTO users FROM public.profiles p;

  FOR u IN SELECT * FROM jsonb_to_recordset(COALESCE(users, '[]')) AS x(uid UUID, role TEXT, client UUID, org UUID) LOOP
    IF u.role = 'client' THEN
      SELECT COALESCE(array_agg(campaign_id), '{}') INTO own FROM public.campaign_assignments WHERE client_id = u.client;
    ELSE
      SELECT COALESCE(array_agg(c.id), '{}') INTO org_campaigns
        FROM public.campaigns c JOIN public.ad_accounts a ON a.id = c.ad_account_id WHERE a.organization_id = u.org;
      -- What an admin MUST see (the /admin/meta page): every org ad account, every org
      -- campaign including unassigned ones, every org client, the org's Meta connection.
      SELECT count(*) INTO exp_accounts FROM public.ad_accounts WHERE organization_id = u.org;
      exp_campaigns := cardinality(org_campaigns);
      SELECT count(*) INTO exp_unassigned FROM public.campaigns c
        WHERE c.id = ANY(org_campaigns) AND NOT EXISTS (SELECT 1 FROM public.campaign_assignments x WHERE x.campaign_id = c.id);
      SELECT count(*) INTO exp_clients FROM public.clients WHERE organization_id = u.org;
      SELECT count(*) INTO exp_conn FROM public.meta_connections WHERE organization_id = u.org;
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', u.uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', u.uid::text, true);
    SET LOCAL ROLE authenticated;

    IF u.role = 'client' THEN
      SELECT count(*) INTO n FROM public.clients WHERE id <> u.client;
      IF n > 0 THEN RAISE EXCEPTION 'client % sees % other clients', u.client, n; END IF;
      SELECT count(*) INTO n FROM public.campaigns WHERE NOT (id = ANY(own));
      IF n > 0 THEN RAISE EXCEPTION 'client % sees % unassigned campaigns', u.client, n; END IF;
      SELECT count(*) INTO n FROM public.campaign_insights WHERE NOT (campaign_id = ANY(own));
      IF n > 0 THEN RAISE EXCEPTION 'client % sees % insight rows of other campaigns', u.client, n; END IF;
      SELECT count(*) INTO n FROM public.campaign_events e
        WHERE NOT (e.campaign_id = ANY(own))
           OR COALESCE(to_jsonb(e)->>'client_id', u.client::text) <> u.client::text;
      IF n > 0 THEN RAISE EXCEPTION 'client % sees % events of other clients/campaigns', u.client, n; END IF;
      SELECT count(*) INTO n FROM public.campaign_assignments WHERE client_id <> u.client;
      IF n > 0 THEN RAISE EXCEPTION 'client % sees % assignments of other clients', u.client, n; END IF;
    ELSE
      SELECT count(*) INTO n FROM public.campaigns WHERE NOT (id = ANY(org_campaigns));
      IF n > 0 THEN RAISE EXCEPTION 'admin of org % sees % campaigns of other orgs', u.org, n; END IF;
      SELECT count(*) INTO n FROM public.campaign_events WHERE organization_id <> u.org;
      IF n > 0 THEN RAISE EXCEPTION 'admin of org % sees % events of other orgs', u.org, n; END IF;
      SELECT count(*) INTO n FROM public.clients WHERE organization_id <> u.org;
      IF n > 0 THEN RAISE EXCEPTION 'admin of org % sees % clients of other orgs', u.org, n; END IF;
      -- Admin visibility (must not be hidden by RLS):
      SELECT count(*) INTO n FROM public.ad_accounts WHERE organization_id = u.org;
      IF n <> exp_accounts THEN RAISE EXCEPTION 'admin of org % sees % of % ad accounts', u.org, n, exp_accounts; END IF;
      SELECT count(*) INTO n FROM public.campaigns c JOIN public.ad_accounts a ON a.id = c.ad_account_id WHERE a.organization_id = u.org;
      IF n <> exp_campaigns THEN RAISE EXCEPTION 'admin of org % sees % of % campaigns', u.org, n, exp_campaigns; END IF;
      SELECT count(*) INTO n FROM public.campaigns c
        WHERE c.id = ANY(org_campaigns) AND NOT EXISTS (SELECT 1 FROM public.campaign_assignments x WHERE x.campaign_id = c.id);
      IF n <> exp_unassigned THEN RAISE EXCEPTION 'admin of org % sees % of % unassigned campaigns', u.org, n, exp_unassigned; END IF;
      SELECT count(*) INTO n FROM public.clients WHERE organization_id = u.org;
      IF n <> exp_clients THEN RAISE EXCEPTION 'admin of org % sees % of % clients', u.org, n, exp_clients; END IF;
      SELECT count(*) INTO n FROM public.meta_connections WHERE organization_id = u.org;
      IF n <> exp_conn THEN RAISE EXCEPTION 'admin of org % sees % of % meta connections', u.org, n, exp_conn; END IF;
    END IF;

    RESET ROLE;
    checked := checked + 1;
  END LOOP;

  -- anon: no rows (or no privilege at all, after the migration).
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    SELECT (SELECT count(*) FROM public.campaign_events) + (SELECT count(*) FROM public.campaigns)
         + (SELECT count(*) FROM public.campaign_insights) + (SELECT count(*) FROM public.clients) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'anon sees % rows', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected after migration 20261126000000
  END;
  RESET ROLE;

  RAISE NOTICE 'RLS isolation OK for % users', checked;
END $$;

ROLLBACK;
