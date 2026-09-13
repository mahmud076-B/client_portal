-- Migration 0006_campaign_discovery.sql

-- 1. Add missing Meta metadata columns to campaigns
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS effective_status TEXT,
ADD COLUMN IF NOT EXISTS buying_type TEXT;

-- 2. Add strict mutation (INSERT/UPDATE) policies for Admins
-- (No DELETE policies are added as they are not required for Step 06)

-- 2A. Ad Accounts Mutation
CREATE POLICY "Admins can insert org ad accounts" ON public.ad_accounts
    FOR INSERT WITH CHECK (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    );

CREATE POLICY "Admins can update org ad accounts" ON public.ad_accounts
    FOR UPDATE USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    ) WITH CHECK (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = public.get_auth_org_id()
    );

-- 2B. Campaigns Mutation
CREATE POLICY "Admins can insert org campaigns" ON public.campaigns
    FOR INSERT WITH CHECK (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        ad_account_id IN (SELECT id FROM public.ad_accounts WHERE organization_id = public.get_auth_org_id())
    );

CREATE POLICY "Admins can update org campaigns" ON public.campaigns
    FOR UPDATE USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        ad_account_id IN (SELECT id FROM public.ad_accounts WHERE organization_id = public.get_auth_org_id())
    ) WITH CHECK (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        ad_account_id IN (SELECT id FROM public.ad_accounts WHERE organization_id = public.get_auth_org_id())
    );

-- 2C. Campaign Assignments Mutation
CREATE POLICY "Admins can insert org assignments" ON public.campaign_assignments
    FOR INSERT WITH CHECK (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        client_id IN (SELECT id FROM public.clients WHERE organization_id = public.get_auth_org_id()) AND
        campaign_id IN (
            SELECT c.id FROM public.campaigns c
            JOIN public.ad_accounts a ON c.ad_account_id = a.id
            WHERE a.organization_id = public.get_auth_org_id()
        )
    );

-- Note: Existing clients are blocked entirely from mutations because 
-- they do not match `public.get_auth_role() IN ('admin', 'super_admin')`
