-- Migration 0007_fix_rls_recursion.sql

-- Drop the recursive policy
DROP POLICY IF EXISTS "Admins can insert org assignments" ON public.campaign_assignments;

-- Recreate the policy WITHOUT querying campaigns to avoid infinite recursion.
-- We rely on the client_id check to ensure it's restricted to the admin's organization,
-- and the server-side action (actions.ts) explicitly validates campaign ownership before inserting.
CREATE POLICY "Admins can insert org assignments" ON public.campaign_assignments
    FOR INSERT WITH CHECK (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        client_id IN (SELECT id FROM public.clients WHERE organization_id = public.get_auth_org_id())
    );
