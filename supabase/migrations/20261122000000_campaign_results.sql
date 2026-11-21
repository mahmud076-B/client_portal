-- Objective-aware campaign results + delivery status.
-- Safe to run more than once. Apply BEFORE merging (the sync falls back to legacy columns if not applied).

-- Ad set optimization goal (drives which metric counts as the campaign "Result", as in Ads Manager)
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS optimization_goal TEXT;

-- Raw Meta insights arrays so every objective's result (follows, ThruPlays, purchases, leads, ...) can be computed
ALTER TABLE public.campaign_insights
    ADD COLUMN IF NOT EXISTS actions JSONB,
    ADD COLUMN IF NOT EXISTS action_values JSONB,
    ADD COLUMN IF NOT EXISTS cost_per_action_type JSONB,
    ADD COLUMN IF NOT EXISTS video_thruplays INTEGER,
    ADD COLUMN IF NOT EXISTS frequency NUMERIC(10,4);

COMMENT ON COLUMN public.campaigns.optimization_goal IS 'Most common optimization_goal of the campaign''s live ad sets (Meta AdSet.optimization_goal).';
COMMENT ON COLUMN public.campaign_insights.actions IS 'Meta insights `actions` (AdsActionStats[]) for the day.';
COMMENT ON COLUMN public.campaign_insights.action_values IS 'Meta insights `action_values` (AdsActionStats[]) — purchase value for ROAS.';
COMMENT ON COLUMN public.campaign_insights.video_thruplays IS 'Sum of video_thruplay_watched_actions for the day.';
