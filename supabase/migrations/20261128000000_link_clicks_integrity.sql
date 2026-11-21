-- 1) inline_link_clicks can never be NULL when the same day's actions carry link_click.
--    Guards every writer (including deployments still running older code mid-rollout).
create or replace function public.fill_inline_link_clicks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.inline_link_clicks is null and new.actions is not null and jsonb_typeof(new.actions) = 'array' then
    select (a->>'value')::numeric::integer into new.inline_link_clicks
    from jsonb_array_elements(new.actions) a
    where a->>'action_type' = 'link_click'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_inline_link_clicks on public.campaign_insights;
create trigger trg_fill_inline_link_clicks
  before insert or update on public.campaign_insights
  for each row execute function public.fill_inline_link_clicks();

-- 2) Repair rows written between migration 20261127000000 and the PR #10 deploy.
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

-- 3) Performance events: one verdict per client, campaign, METRIC and day.
--    a) all-click CTR verdicts written by the pre-PR #10 deployment after 20261127000000 ran;
delete from public.campaign_events
where event_key like '%:perf:%'
  and metadata->>'metric' = 'ctr'
  and title not ilike '%link click-through%';
--    b) keep the newest verdict per (client, campaign, metric, day);
delete from public.campaign_events e
using (
  select id, row_number() over (
    partition by client_id, campaign_id, metadata->>'metric', metadata->>'day'
    order by created_at desc, id desc
  ) as rn
  from public.campaign_events
  where event_key like '%:perf:%'
) d
where e.id = d.id and d.rn > 1;
--    c) re-key to the metric-based key used by the app (perfEventKey).
update public.campaign_events
set event_key  = campaign_id::text || ':perf:' || (metadata->>'metric') || ':' || (metadata->>'day'),
    dedupe_key = client_id::text || ':' || campaign_id::text || ':perf:' || (metadata->>'metric') || ':' || (metadata->>'day')
where event_key like '%:perf:%'
  and metadata ? 'metric' and metadata ? 'day';

-- 4) The product invariant, enforced: one row per client + event_key.
create unique index if not exists campaign_events_client_event_key_uniq
  on public.campaign_events (client_id, event_key);
