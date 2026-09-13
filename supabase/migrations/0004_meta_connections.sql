-- Migration 0004_meta_connections.sql

CREATE TABLE public.meta_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    meta_user_id TEXT,
    encrypted_token TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    iv TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- Index for speedy organization lookups
CREATE INDEX idx_meta_connections_org_id ON public.meta_connections(organization_id);

-- RLS Policies
-- Only allow super_admin or admins of the matching organization to access connections

CREATE POLICY "Admins can select their organization's meta connections"
    ON public.meta_connections
    FOR SELECT
    USING (
        get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = (SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Admins can insert their organization's meta connections"
    ON public.meta_connections
    FOR INSERT
    WITH CHECK (
        get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = (SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Admins can update their organization's meta connections"
    ON public.meta_connections
    FOR UPDATE
    USING (
        get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = (SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid())
    )
    WITH CHECK (
        get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = (SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Admins can delete their organization's meta connections"
    ON public.meta_connections
    FOR DELETE
    USING (
        get_auth_role() IN ('admin', 'super_admin') AND
        organization_id = (SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid())
    );
