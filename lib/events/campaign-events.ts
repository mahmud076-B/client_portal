import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sumInsights, type MetricTotals } from '@/lib/campaigns/metrics';
import { computeResult, deriveDeliveryStatus, resolveResultSpecForData, type DerivedStatus, type InsightRow } from '@/lib/meta/results';
import { buildPerformanceInsights, localDay, type InsightDayRow, type InsightEventType } from '@/lib/events/performance-insights';
import { formatCount, formatMoney } from '@/lib/format';

/**
 * Live-updates event generation.
 *
 * The sync job calls `snapshotAccountCampaigns` before and after it refreshes an
 * ad account, then `recordCampaignEvents` diffs the two snapshots PER CAMPAIGN
 * (each event is computed only from that campaign's own rows) and writes one
 * row per (campaign, assigned client) to public.campaign_events, so RLS can
 * scope every row by client_id. Campaigns not assigned to any client produce no
 * rows. Failures here are logged and swallowed so they never break the sync.
 */

export interface CampaignSnapshot {
  id: string;
  name: string;
  objective: string | null;
  effective_status: string | null;
  derived_status: DerivedStatus;
  lifetime_budget: number | null;
  /** ISO end time (campaign or ad sets), used to tell a real completion from a status catch-up. */
  end_time: string | null;
  totals: MetricTotals;
  /** The campaign's own result (resolved from objective/goal + its data), e.g. messaging conversations. */
  result: { label: string; total: number } | null;
  /** Number of synced days; 0 = nothing synced yet (first sync is not "new results"). */
  days: number;
}

export type AccountSnapshot = Map<string, CampaignSnapshot>;

/**
 * After a historical backfill, take the metric totals from `fresh` but keep the
 * statuses from `before`. Otherwise days recovered from the past would be announced
 * as "+597 new results" / spend milestones, while real status changes in the same run
 * must still be detected. Pure.
 */
export function rebaseSnapshotTotals(before: AccountSnapshot, fresh: AccountSnapshot | null): AccountSnapshot {
  if (!fresh) return before;
  const out: AccountSnapshot = new Map();
  for (const [id, b] of before) {
    const f = fresh.get(id);
    out.set(id, f ? { ...b, totals: f.totals, result: f.result, days: f.days } : b);
  }
  return out;
}

export type CampaignEventType =
  | 'status_changed'
  | 'campaign_completed'
  | 'new_results'
  | 'spend_milestone'
  | 'budget_milestone'
  | InsightEventType;

/** A campaign-level event, before it is attributed to the campaign's clients. */
export interface CampaignEvent {
  campaign_id: string;
  event_type: CampaignEventType;
  severity: 'info' | 'success' | 'warning';
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  /** Stable per-campaign idempotency key, e.g. "<campaign>:results:2026-11-21T19:30". */
  event_key: string;
  occurred_at: string;
}

/** A row of public.campaign_events: always one campaign + one client it is assigned to. */
export interface CampaignEventInsert extends CampaignEvent {
  organization_id: string;
  client_id: string;
  dedupe_key: string;
}

/** campaign_id -> client ids it is assigned to (public.campaign_assignments). */
export type AssignmentMap = Map<string, string[]>;

/**
 * Fan each campaign event out to the clients that campaign is assigned to. Pure.
 * The row's campaign_id is always the event's own campaign; unassigned campaigns are dropped.
 */
export function attributeEvents(events: CampaignEvent[], organizationId: string, assignments: AssignmentMap): CampaignEventInsert[] {
  const out: CampaignEventInsert[] = [];
  for (const e of events) {
    for (const clientId of new Set(assignments.get(e.campaign_id) ?? [])) {
      out.push({ ...e, organization_id: organizationId, client_id: clientId, dedupe_key: `${clientId}:${e.event_key}` });
    }
  }
  return out;
}

const PAGE = 1000;

export async function snapshotAccountCampaigns(
  supabase: SupabaseClient,
  adAccountId: string
): Promise<AccountSnapshot | null> {
  try {
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, objective, optimization_goal, status, effective_status, end_time, lifetime_budget')
      .eq('ad_account_id', adAccountId);
    if (error) throw error;

    const snapshot: AccountSnapshot = new Map();
    const ids = (campaigns || []).map((c) => c.id as string);
    const rowsByCampaign = new Map<string, Record<string, unknown>[]>();

    if (ids.length > 0) {
      // PostgREST caps responses at 1000 rows, so page through.
      for (let from = 0; ; from += PAGE) {
        const { data: rows, error: insErr } = await supabase
          .from('campaign_insights')
          .select('*')
          .in('campaign_id', ids)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (insErr) throw insErr;
        for (const row of rows || []) {
          const list = rowsByCampaign.get(row.campaign_id) ?? [];
          list.push(row);
          rowsByCampaign.set(row.campaign_id, list);
        }
        if (!rows || rows.length < PAGE) break;
      }
    }

    for (const c of campaigns || []) {
      const rows = rowsByCampaign.get(c.id) ?? [];
      snapshot.set(c.id, {
        id: c.id,
        name: c.name,
        objective: c.objective ?? null,
        effective_status: c.effective_status ?? c.status ?? null,
        derived_status: deriveDeliveryStatus(c).code,
        lifetime_budget: c.lifetime_budget != null ? Number(c.lifetime_budget) : null,
        end_time: c.end_time ?? null,
        totals: sumInsights(rows),
        result: campaignResult(c, rows as unknown as InsightRow[]),
        days: rows.length,
      });
    }
    return snapshot;
  } catch (err: any) {
    console.warn(`[CampaignEvents] snapshot failed for ad_account=${adAccountId}: ${err?.message || err}`);
    return null;
  }
}

/** The campaign's own result total (same mapping as the dashboard), or null for reach/awareness-only. Pure. */
export function campaignResult(
  campaign: { objective?: string | null; optimization_goal?: string | null },
  rows: InsightRow[]
): { label: string; total: number } | null {
  const spec = resolveResultSpecForData(campaign.objective, campaign.optimization_goal, rows);
  if (!spec || spec.metric.kind === 'reach' || spec.metric.kind === 'impressions') return null;
  const r = computeResult(spec, rows, { totalSpend: 0 });
  if (r.pendingResync || r.total === null) return null;
  const l = spec.label.split(' / ')[0];
  return { label: /[A-Z].*[A-Z]/.test(l) ? l : l.toLowerCase(), total: r.total };
}

/** 100, 200, 500, 1k, 2k, 5k, ... — currency-agnostic "nice" spend steps. */
export function spendSteps(max: number): number[] {
  const steps: number[] = [];
  for (let base = 100; base <= max; base *= 10) {
    for (const m of [1, 2, 5]) {
      if (base * m <= max) steps.push(base * m);
    }
  }
  return steps;
}

const fmt = (n: number, currency: string | null) => formatMoney(n, currency);

/** A completion is news only if the campaign ended within this window. */
export const STATUS_NEWS_WINDOW_MS = 48 * 3600_000;

/**
 * Pure per-campaign diff (exported for testing). Each event is built only from
 * `before.get(id)` / `after.get(id)` of the SAME campaign id.
 */
export function diffSnapshots(params: {
  before: AccountSnapshot;
  after: AccountSnapshot;
  currency: string | null;
  syncedAt: Date;
}): CampaignEvent[] {
  const { before, after, currency, syncedAt } = params;
  const occurred_at = syncedAt.toISOString();
  const runKey = occurred_at.slice(0, 16); // minute bucket for per-run events
  const events: CampaignEvent[] = [];

  for (const [id, now] of after) {
    const prev = before.get(id);
    if (!prev) continue; // newly discovered campaigns are not "updates"

    // 1. Status / completion: only news about the present. Archiving/deleting is
    //    housekeeping, and a campaign that ended days ago is a catch-up (e.g. the first
    //    successful metadata refresh after an outage), not "has completed" today.
    const endedLongAgo = now.end_time != null && Date.parse(now.end_time) < syncedAt.getTime() - STATUS_NEWS_WINDOW_MS;
    const housekeeping = now.derived_status === 'ARCHIVED' || now.derived_status === 'DELETED';
    if (prev.derived_status !== now.derived_status && !housekeeping && !(now.derived_status === 'COMPLETED' && endedLongAgo)) {
      if (now.derived_status === 'COMPLETED') {
        events.push({
          campaign_id: id,
          event_type: 'campaign_completed',
          severity: 'success',
          title: `${now.name} has completed`,
          body: `Final spend ${fmt(now.totals.spend ?? 0, currency)}.`,
          metadata: { from: prev.derived_status, to: now.derived_status, totals: now.totals },
          event_key: `${id}:completed`,
          occurred_at,
        });
      } else {
        const warn = now.derived_status === 'REJECTED' || now.derived_status === 'PAUSED';
        events.push({
          campaign_id: id,
          event_type: 'status_changed',
          severity: warn ? 'warning' : now.derived_status === 'ACTIVE' ? 'success' : 'info',
          title: `${now.name} is now ${now.derived_status.toLowerCase().replace('_', ' ')}`,
          body: `Status changed from ${prev.derived_status.toLowerCase().replace('_', ' ')}.`,
          metadata: { from: prev.derived_status, to: now.derived_status, effective_status: now.effective_status },
          event_key: `${id}:status:${prev.derived_status}->${now.derived_status}:${runKey}`,
          occurred_at,
        });
      }
    }

    // 2. New results since the previous sync: the campaign's OWN result type only
    //    (e.g. messaging conversations), never a mix of every Meta action type.
    //    The first sync of a campaign (days 0 -> n) is history, not news.
    const spendDelta = Math.round(((now.totals.spend ?? 0) - (prev.totals.spend ?? 0)) * 100) / 100;
    if (prev.days > 0 && now.result && prev.result && now.result.label === prev.result.label) {
      const delta = Math.round(now.result.total - prev.result.total);
      if (delta > 0) {
        const spendNow = now.totals.spend ?? 0;
        events.push({
          campaign_id: id,
          event_type: 'new_results',
          severity: 'success',
          title: `${now.name}: +${formatCount(delta)} ${now.result.label}`,
          body:
            `${spendDelta > 0 ? `${fmt(spendDelta, currency)} spent since the previous sync. ` : ''}` +
            `Total ${formatCount(now.result.total)} ${now.result.label} for ${fmt(spendNow, currency)}.`,
          metadata: {
            metric: now.result.label,
            delta,
            from: prev.result.total,
            to: now.result.total,
            spend_delta: spendDelta,
            spend_total: spendNow,
          },
          event_key: `${id}:results:${runKey}`,
          occurred_at,
        });
      }
    }

    // 3. Budget milestones (lifetime budget only)
    const spendPrev = prev.totals.spend ?? 0;
    const spendNow = now.totals.spend ?? 0;
    if (now.lifetime_budget && now.lifetime_budget > 0) {
      const crossed = [50, 80, 100].filter(
        (p) => spendPrev < (now.lifetime_budget! * p) / 100 && spendNow >= (now.lifetime_budget! * p) / 100
      );
      const top = crossed.at(-1);
      if (top) {
        events.push({
          campaign_id: id,
          event_type: 'budget_milestone',
          severity: top === 100 ? 'warning' : 'info',
          title: `${now.name} has used ${top}% of its budget`,
          body: `${fmt(spendNow, currency)} of ${fmt(now.lifetime_budget, currency)} spent.`,
          metadata: { percent: top, spend: spendNow, lifetime_budget: now.lifetime_budget },
          event_key: `${id}:budget:${top}`,
          occurred_at,
        });
      }
    }

    // 4. Absolute spend milestones
    const crossedSteps = spendSteps(spendNow).filter((s) => spendPrev < s && spendNow >= s);
    const step = crossedSteps.at(-1);
    if (step) {
      events.push({
        campaign_id: id,
        event_type: 'spend_milestone',
        severity: 'info',
        title: `${now.name} passed ${fmt(step, currency)} in spend`,
        body: `Total spend is now ${fmt(spendNow, currency)}.`,
        metadata: { milestone: step, spend: spendNow },
        event_key: `${id}:spend:${step}`,
        occurred_at,
      });
    }
  }
  return events;
}

/**
 * Daily performance commentary ("running well now", "reach is down 25% vs
 * yesterday"). Deduped per campaign, per insight kind, per ad-account day.
 */
export async function buildAccountPerformanceEvents(
  supabase: SupabaseClient,
  params: { organizationId: string; adAccountId: string; currency?: string | null; timezone?: string | null; now?: Date }
): Promise<CampaignEvent[]> {
  const now = params.now ?? new Date();
  let tz = params.timezone || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'UTC'; }
  const { today, dayFraction } = localDay(tz, now);

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name, objective, optimization_goal, status, effective_status, start_time, end_time, daily_budget, lifetime_budget')
    .eq('ad_account_id', params.adAccountId);
  if (error) throw error;
  const live = (campaigns || []).filter((c) => deriveDeliveryStatus(c, now).isLive);
  if (live.length === 0) return [];

  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 9 * 86400_000).toISOString().slice(0, 10);
  const rowsByCampaign = new Map<string, InsightDayRow[]>();
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error: insErr } = await supabase
      .from('campaign_insights')
      .select('campaign_id, date, impressions, reach, clicks, spend, actions, action_values, video_thruplays')
      .in('campaign_id', live.map((c) => c.id))
      .gte('date', since)
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (insErr) throw insErr;
    for (const row of rows || []) {
      const list = rowsByCampaign.get(row.campaign_id) ?? [];
      list.push(row as InsightDayRow);
      rowsByCampaign.set(row.campaign_id, list);
    }
    if (!rows || rows.length < PAGE) break;
  }

  const occurred_at = now.toISOString();
  const out: CampaignEvent[] = [];
  for (const c of live) {
    const insights = buildPerformanceInsights({
      campaign: c, rows: rowsByCampaign.get(c.id) ?? [], today, dayFraction, currency: params.currency ?? null, now,
    });
    for (const e of insights) {
      // One evaluation per campaign per judged (completed) day.
      const day = typeof e.metadata.day === 'string' ? e.metadata.day : today;
      out.push({
        campaign_id: c.id,
        event_type: e.type,
        severity: e.severity,
        title: e.title,
        body: e.body,
        metadata: { ...e.metadata, kind: e.kind, source: 'performance_insight' },
        event_key: `${c.id}:perf:${e.kind}:${day}`,
        occurred_at,
      });
    }
  }
  return out;
}

async function loadAssignments(supabase: SupabaseClient, campaignIds: string[]): Promise<AssignmentMap> {
  const map: AssignmentMap = new Map();
  if (campaignIds.length === 0) return map;
  const { data, error } = await supabase
    .from('campaign_assignments')
    .select('campaign_id, client_id')
    .in('campaign_id', campaignIds);
  if (error) throw error;
  for (const a of data || []) {
    const list = map.get(a.campaign_id) ?? [];
    list.push(a.client_id);
    map.set(a.campaign_id, list);
  }
  return map;
}

async function writeEvents(supabase: SupabaseClient, organizationId: string, events: CampaignEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const assignments = await loadAssignments(supabase, [...new Set(events.map((e) => e.campaign_id))]);
  const rows = attributeEvents(events, organizationId, assignments);
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from('campaign_events')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

export async function recordCampaignEvents(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    adAccountId: string;
    before: AccountSnapshot | null;
    currency?: string | null;
    timezone?: string | null;
  }
): Promise<number> {
  let written = 0;
  try {
    if (params.before) {
      const after = await snapshotAccountCampaigns(supabase, params.adAccountId);
      if (after) {
        const events = diffSnapshots({ before: params.before, after, currency: params.currency ?? null, syncedAt: new Date() });
        written += await writeEvents(supabase, params.organizationId, events);
      }
    }
  } catch (err: any) {
    // e.g. migration not applied yet: never fail the sync because of the feed.
    console.warn(`[CampaignEvents] record failed for ad_account=${params.adAccountId}: ${err?.message || err}`);
  }

  // Performance commentary is written separately so a failure there never blocks status/results events.
  try {
    const perf = await buildAccountPerformanceEvents(supabase, params);
    written += await writeEvents(supabase, params.organizationId, perf);
  } catch (err: any) {
    console.warn(`[CampaignEvents] performance insights failed for ad_account=${params.adAccountId}: ${err?.message || err}`);
  }
  return written;
}
