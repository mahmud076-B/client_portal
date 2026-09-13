-- Migration 0001_rls_policies.sql
-- Sets up Row Level Security (RLS) to enforce strict client data isolation

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get the current user's profile role
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Helper function to get the current user's client_id
CREATE OR REPLACE FUNCTION public.get_auth_client_id()
RETURNS UUID AS $$
  SELECT client_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Helper function to get the current user's organization_id
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;


-- 1. Profiles Policy
-- Users can read their own profile. Admins/Super Admins can read profiles in their org.
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth_user_id = auth.uid());
    
CREATE POLICY "Admins can read org profiles" ON public.profiles
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    );


-- 2. Organizations Policy
-- Users can read their own organization details
CREATE POLICY "Users can read own organization" ON public.organizations
    FOR SELECT USING (id = public.get_auth_org_id());


-- 3. Clients Policy
-- Clients can read their own client record
CREATE POLICY "Clients can read own client record" ON public.clients
    FOR SELECT USING (id = public.get_auth_client_id());

-- Admins can read all clients in their org
CREATE POLICY "Admins can read org clients" ON public.clients
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    );


-- 4. Campaign Assignments Policy
-- Clients can read their own assignments
CREATE POLICY "Clients can read own assignments" ON public.campaign_assignments
    FOR SELECT USING (client_id = public.get_auth_client_id());

-- Admins can read all assignments for clients in their org
CREATE POLICY "Admins can read org assignments" ON public.campaign_assignments
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        client_id IN (SELECT id FROM public.clients WHERE organization_id = public.get_auth_org_id())
    );


-- 5. Campaigns Policy
-- Clients can read campaigns assigned to them via campaign_assignments
CREATE POLICY "Clients can read assigned campaigns" ON public.campaigns
    FOR SELECT USING (
        id IN (SELECT campaign_id FROM public.campaign_assignments WHERE client_id = public.get_auth_client_id())
    );

-- Admins can read all campaigns in their org's ad accounts
CREATE POLICY "Admins can read org campaigns" ON public.campaigns
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        ad_account_id IN (SELECT id FROM public.ad_accounts WHERE organization_id = public.get_auth_org_id())
    );


-- 6. Ad Accounts Policy
-- Only admins can read ad accounts
CREATE POLICY "Admins can read org ad accounts" ON public.ad_accounts
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    );


-- 7. Sync Logs Policy
-- Only admins can read sync logs
CREATE POLICY "Admins can read org sync logs" ON public.sync_logs
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        ad_account_id IN (SELECT id FROM public.ad_accounts WHERE organization_id = public.get_auth_org_id())
    );

