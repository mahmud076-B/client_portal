-- Migration for Step 09: Campaign Insights

CREATE TABLE public.campaign_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL, -- The date these metrics represent.
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    spend NUMERIC(12,2) DEFAULT 0,
    reach INTEGER DEFAULT 0,
    cpc NUMERIC(12,2),
    cpm NUMERIC(12,2),
    ctr NUMERIC(8,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, date)
);

CREATE INDEX idx_campaign_insights_campaign_id ON public.campaign_insights(campaign_id);
CREATE INDEX idx_campaign_insights_date ON public.campaign_insights(date);

ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;

-- Clients can read insights for campaigns assigned to them
CREATE POLICY "Clients can read assigned campaign insights" ON public.campaign_insights
    FOR SELECT USING (
        campaign_id IN (SELECT campaign_id FROM public.campaign_assignments WHERE client_id = public.get_auth_client_id())
    );

-- Admins can read all campaign insights in their org's ad accounts
CREATE POLICY "Admins can read org campaign insights" ON public.campaign_insights
    FOR SELECT USING (
        public.get_auth_role() IN ('admin', 'super_admin') AND
        campaign_id IN (
            SELECT c.id FROM public.campaigns c
            JOIN public.ad_accounts a ON c.ad_account_id = a.id
            WHERE a.organization_id = public.get_auth_org_id()
        )
    );
