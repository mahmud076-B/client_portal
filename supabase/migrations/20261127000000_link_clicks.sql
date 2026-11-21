-- Ads Manager "Link clicks" per day. CPC (cost per link click) = spend / link clicks and
-- CTR (link click-through rate) = link clicks / impressions are computed from period SUMS
-- of this column. `clicks` stays "Clicks (all)". The stored per-day cpc/ctr columns are
-- Meta's all-click ratios rounded per row and are not used for display.
alter table public.campaign_insights
  add column if not exists inline_link_clicks integer;

comment on column public.campaign_insights.inline_link_clicks is
  'Meta inline_link_clicks (Ads Manager "Link clicks"). NULL on rows synced before this column existed; readers fall back to actions[link_click].';

-- Last day through which the cron gap backfill has already asked Meta for this campaign.
-- Days with zero delivery return no row from Meta, so without this marker the same
-- "gap" was refetched on every run (e.g. 328 rows every 30 min).
alter table public.campaigns
  add column if not exists insights_backfilled_through date;

-- Backfill inline_link_clicks for existing rows from the identical link_click action.
update public.campaign_insights i
set inline_link_clicks = (
  select (a->>'value')::numeric::integer
  from jsonb_array_elements(i.actions) a
  where a->>'action_type' = 'link_click'
  limit 1
)
where i.inline_link_clicks is null
  and i.actions is not null
  and jsonb_typeof(i.actions) = 'array';

-- Live Updates CTR events generated before this change compared CTR (all clicks)
-- (e.g. "CTR up 23% (14.13% vs 11.45%)") while the dashboard shows CTR (link). Remove them;
-- the next sync regenerates commentary with the link definition.
delete from public.campaign_events
where metadata->>'metric' = 'ctr';
