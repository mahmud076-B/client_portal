import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserProfile } from '@/lib/supabase/auth';
import { deriveRatios, sumInsights, sumLinkClicks } from '@/lib/campaigns/metrics';
import { deriveDeliveryStatus, objectiveLabel } from '@/lib/meta/results';
import { dayOverDay, localDay, type InsightDayRow } from '@/lib/events/performance-insights';

/**
 * Data access for the AI assistant and the Live Updates feed.
 *
 * Every campaign/insight/event read goes through the CALLER's Supabase session
 * (`supabase`), so Row Level Security decides what is visible: a client only
 * ever sees campaigns assigned to them; admins see their organization.
 * The service-role client is used only to read ad-account currency/timezone
 * for campaigns the caller has ALREADY been shown via RLS.
 */

export interface Scope {
  supabase: SupabaseClient;
  profile: UserProfile;
}

export const isAdmin = (p: UserProfile) => p.role === 'admin' || p.role === 'super_admin';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function accountMeta(adAccountIds: string[]) {
  const map = new Map<string, { currency: string | null; timezone_name: string | null }>();
  if (adAccountIds.length === 0) return map;
  const { data } = await createAdminClient()
    .from('ad_accounts')
    .select('id, currency, timezone_name')
    .in('id', adAccountIds);
  for (const a of data || []) map.set(a.id, { currency: a.currency ?? null, timezone_name: a.timezone_name ?? null });
  return map;
}

async function campaignIdsForClient(scope: Scope, clientId: string): Promise<string[]> {
  const { data } = await scope.supabase
    .from('campaign_assignments')
    .select('campaign_id')
    .eq('client_id', clientId);
  return (data || []).map((r) => r.campaign_id as string);
}

export async function listClients(scope: Scope) {
  if (!isAdmin(scope.profile)) return { error: 'Only admins can list clients.' };
  const { data, error } = await scope.supabase
    .from('clients')
    .select('id, name, company_name, status')
    .order('name');
  if (error) return { error: error.message };
  return { clients: data || [] };
}

export async function listCampaigns(scope: Scope, opts: { clientId?: string; campaignIds?: string[] } = {}) {
  if (opts.campaignIds && opts.campaignIds.length === 0) return { campaigns: [] };
  let query = scope.supabase
    .from('campaigns')
    .select('id, name, objective, optimization_goal, status, effective_status, daily_budget, lifetime_budget, start_time, end_time, ad_account_id, updated_at')
    .order('start_time', { ascending: false, nullsFirst: false });

  if (opts.campaignIds) query = query.in('id', opts.campaignIds);
  // Clients are already scoped by RLS; the filter is an admin convenience.
  if (opts.clientId && isAdmin(scope.profile)) {
    const ids = await campaignIdsForClient(scope, opts.clientId);
    if (ids.length === 0) return { campaigns: [] };
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  const meta = await accountMeta([...new Set((data || []).map((c) => c.ad_account_id as string))]);

  return {
    campaigns: (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      objective: objectiveLabel(c.objective, c.optimization_goal),
      status: deriveDeliveryStatus(c).code,
      status_label: deriveDeliveryStatus(c).label,
      meta_effective_status: c.effective_status ?? c.status,
      daily_budget: c.daily_budget,
      lifetime_budget: c.lifetime_budget,
      currency: meta.get(c.ad_account_id)?.currency ?? null,
      start_time: c.start_time,
      end_time: c.end_time,
    })),
  };
}

export async function getCampaignMetrics(
  scope: Scope,
  opts: { campaignId: string; since?: string; until?: string; includeDaily?: boolean }
) {
  // RLS check: the campaign must be visible to this user.
  const { data: campaign } = await scope.supabase
    .from('campaigns')
    .select('id, name, objective, optimization_goal, status, effective_status, start_time, end_time, lifetime_budget, daily_budget, ad_account_id')
    .eq('id', opts.campaignId)
    .maybeSingle();
  if (!campaign) return { error: 'Campaign not found or not accessible for this user.' };

  const since = opts.since && ISO_DATE.test(opts.since) ? opts.since : undefined;
  const until = opts.until && ISO_DATE.test(opts.until) ? opts.until : undefined;

  let q = scope.supabase
    .from('campaign_insights')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('date', { ascending: true })
    .limit(1000);
  if (since) q = q.gte('date', since);
  if (until) q = q.lte('date', until);
  const { data: rows, error } = await q;
  if (error) return { error: error.message };

  const meta = (await accountMeta([campaign.ad_account_id])).get(campaign.ad_account_id);
  const totals = sumInsights(rows || []);
  const strip = (r: Record<string, unknown>) => {
    const { id: _id, campaign_id: _c, created_at: _ca, updated_at: _u, ...rest } = r;
    return rest;
  };

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: objectiveLabel(campaign.objective, campaign.optimization_goal),
      status: deriveDeliveryStatus(campaign).code,
      status_label: deriveDeliveryStatus(campaign).label,
      lifetime_budget: campaign.lifetime_budget,
      daily_budget: campaign.daily_budget,
      end_time: campaign.end_time,
    },
    currency: meta?.currency ?? null,
    timezone: meta?.timezone_name ?? null,
    range: {
      since: since ?? rows?.[0]?.date ?? null,
      until: until ?? rows?.at(-1)?.date ?? null,
      days_with_data: rows?.length ?? 0,
    },
    totals,
    // Ads Manager definitions: cpc_link/ctr_link_percent are "CPC (cost per link click)" /
    // "CTR (link click-through rate)"; *_all use Clicks (all).
    derived: deriveRatios(totals, sumLinkClicks(rows || [])),
    note:
      'Reach is summed from daily rows and over-counts unique people across days. ' +
      'Days with no row mean no data was synced for that date.',
    // Keep tool output small: last 31 daily rows at most.
    daily: opts.includeDaily ? (rows || []).slice(-31).map(strip) : undefined,
  };
}

export async function getRecentEvents(
  scope: Scope,
  opts: { campaignId?: string; campaignIds?: string[]; clientId?: string; limit?: number; sinceHours?: number } = {}
) {
  if (opts.campaignIds && opts.campaignIds.length === 0) return { events: [] };
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const build = (columns: string, clientScoped: boolean) => {
    let q = scope.supabase
      .from('campaign_events')
      .select(columns)
      .order('occurred_at', { ascending: false })
      // Admins can see one row per assigned client: over-fetch, then collapse by event_key.
      .limit(isAdmin(scope.profile) ? limit * 3 : limit);
    // Server-side scoping (RLS enforces the same; this keeps queries index-backed and explicit).
    if (clientScoped && !isAdmin(scope.profile) && scope.profile.client_id) q = q.eq('client_id', scope.profile.client_id);
    if (opts.campaignId) q = q.eq('campaign_id', opts.campaignId);
    if (opts.campaignIds) q = q.in('campaign_id', opts.campaignIds);
    if (opts.sinceHours) q = q.gte('occurred_at', new Date(Date.now() - opts.sinceHours * 3600_000).toISOString());
    return q;
  };
  if (opts.clientId && isAdmin(scope.profile)) {
    const ids = await campaignIdsForClient(scope, opts.clientId);
    if (ids.length === 0) return { events: [] };
    opts = { ...opts, campaignIds: opts.campaignIds ? opts.campaignIds.filter((id) => ids.includes(id)) : ids };
    if (opts.campaignIds!.length === 0) return { events: [] };
  }
  let { data, error } = await build('id, campaign_id, client_id, event_key, event_type, severity, title, body, metadata, occurred_at, campaigns(name)', true);
  if (error && /client_id|event_key/.test(error.message)) {
    // Migration 20261126000000 not applied yet: legacy columns only.
    ({ data, error } = await build('id, campaign_id, event_type, severity, title, body, metadata, occurred_at, campaigns(name)', false));
  }
  if (error) {
    // 42P01 / PGRST205: table not created yet (migration pending).
    return { events: [], unavailable: true, error: error.message };
  }
  const seen = new Set<string>();
  data = ((data || []) as any[]).filter((e) => {
    const k = e.event_key ?? e.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
  return {
    events: (data || []).map((e: any) => ({
      id: e.id,
      campaign_id: e.campaign_id,
      campaign_name: e.campaigns?.name ?? null,
      type: e.event_type,
      severity: e.severity,
      title: e.title,
      body: e.body,
      occurred_at: e.occurred_at,
    })),
  };
}

/**
 * Day-over-day performance numbers for the visible live campaigns (RLS-scoped),
 * used by the AI coach status line.
 */
export async function getPerformanceSnapshot(scope: Scope, opts: { limit?: number; campaignIds?: string[] } = {}) {
  if (opts.campaignIds && opts.campaignIds.length === 0) return [];
  let cq = scope.supabase
    .from('campaigns')
    .select('id, name, objective, optimization_goal, status, effective_status, start_time, end_time, daily_budget, lifetime_budget, ad_account_id');
  if (opts.campaignIds) cq = cq.in('id', opts.campaignIds);
  const { data: campaigns } = await cq;
  const live = (campaigns || []).filter((c) => deriveDeliveryStatus(c).isLive).slice(0, opts.limit ?? 8);
  if (live.length === 0) return [];
  const meta = await accountMeta([...new Set(live.map((c) => c.ad_account_id as string))]);
  const since = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
  const { data: rows } = await scope.supabase
    .from('campaign_insights')
    .select('campaign_id, date, impressions, reach, clicks, inline_link_clicks, spend, actions, action_values, video_thruplays')
    .in('campaign_id', live.map((c) => c.id))
    .gte('date', since)
    .order('date', { ascending: true })
    .limit(1000);
  const out = [];
  for (const c of live) {
    let tz = meta.get(c.ad_account_id)?.timezone_name || 'UTC';
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'UTC'; }
    const { today, dayFraction } = localDay(tz);
    const d = dayOverDay({ campaign: c, rows: (rows || []).filter((r) => r.campaign_id === c.id) as InsightDayRow[], today, dayFraction });
    if (d) out.push(d);
  }
  return out;
}

/** Latest successful sync across the ad accounts behind the visible campaigns. */
export async function getLastSyncedAt(scope: Scope, opts: { campaignIds?: string[] } = {}): Promise<string | null> {
  let cq = scope.supabase.from('campaigns').select('ad_account_id');
  if (opts.campaignIds) cq = cq.in('id', opts.campaignIds.length ? opts.campaignIds : ['00000000-0000-0000-0000-000000000000']);
  const { data: campaigns } = await cq;
  const ids = [...new Set((campaigns || []).map((c) => c.ad_account_id as string))];
  if (ids.length === 0) return null;
  const { data } = await createAdminClient()
    .from('sync_logs')
    .select('completed_at')
    .in('ad_account_id', ids)
    .eq('status', 'success')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.completed_at ?? null;
}
