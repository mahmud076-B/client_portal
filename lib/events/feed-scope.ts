/**
 * Scope of the Live Updates feed / AI coach line. Pure (unit-tested).
 *
 * RLS already limits a client to their own campaigns, but admins can read every
 * campaign in the organization, so without an explicit scope the feed showed the
 * same campaign's updates on every dashboard. The feed is therefore always asked
 * for specific campaign ids: the selected campaign, or "all campaigns on this
 * dashboard".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SCOPE_CAMPAIGNS = 50;

export interface FeedScope {
  /** undefined = no explicit scope (RLS only). Empty array = nothing to show. */
  campaignIds?: string[];
}

export function parseFeedScope(params: URLSearchParams): FeedScope {
  const raw = [
    ...(params.get('campaignId') ? [params.get('campaignId')!] : []),
    ...(params.get('campaignIds') || '').split(','),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  // Param present (even empty) = explicit scope; absent = RLS only (e.g. AI tools).
  if (!params.has('campaignId') && !params.has('campaignIds')) return {};
  const ids = [...new Set(raw.filter((s) => UUID.test(s)).map((s) => s.toLowerCase()))].slice(0, MAX_SCOPE_CAMPAIGNS);
  return { campaignIds: ids };
}

export function feedScopeKey(scope: FeedScope): string {
  return scope.campaignIds ? [...scope.campaignIds].sort().join(',') : '*';
}

/** Defensive post-filter: never return an event outside the requested campaigns. */
export function filterToScope<T extends { campaign_id: string }>(events: T[], scope: FeedScope): T[] {
  if (!scope.campaignIds) return events;
  const allow = new Set(scope.campaignIds.map((s) => s.toLowerCase()));
  return events.filter((e) => allow.has(String(e.campaign_id).toLowerCase()));
}

/** Query string for the feed endpoints. */
export function feedScopeQuery(campaignIds: string[]): string {
  return campaignIds.length ? `?campaignIds=${encodeURIComponent(campaignIds.join(','))}` : '?campaignIds=';
}
