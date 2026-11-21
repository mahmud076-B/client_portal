import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveStatus, metricLabel, resultColumns, sumInsights, type DerivedStatus, type MetricTotals } from '@/lib/campaigns/metrics';

/**
 * Live-updates event generation.
 *
 * The sync job calls `snapshotAccountCampaigns` before and after it refreshes an
 * ad account, then `recordCampaignEvents` diffs the two snapshots and writes
 * idempotent rows to public.campaign_events. Failures here are logged and
 * swallowed so they can never break the sync itself.
 */

export interface CampaignSnapshot {
  id: string;
  name: string;
  objective: string | null;
  effective_status: string | null;
  derived_status: DerivedStatus;
  lifetime_budget: number | null;
  totals: MetricTotals;
}

export type AccountSnapshot = Map<string, CampaignSnapshot>;

export type CampaignEventType =
  | 'status_changed'
  | 'campaign_completed'
  | 'new_results'
  | 'spend_milestone'
  | 'budget_milestone';

export interface CampaignEventInsert {
  organization_id: string;
  campaign_id: string;
  event_type: CampaignEventType;
  severity: 'info' | 'success' | 'warning';
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string;
  occurred_at: string;
}

const PAGE = 1000;

export async function snapshotAccountCampaigns(
  supabase: SupabaseClient,
  adAccountId: string
): Promise<AccountSnapshot | null> {
  try {
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, objective, status, effective_status, end_time, lifetime_budget')
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
      snapshot.set(c.id, {
        id: c.id,
        name: c.name,
        objective: c.objective ?? null,
        effective_status: c.effective_status ?? c.status ?? null,
        derived_status: deriveStatus(c),
        lifetime_budget: c.lifetime_budget != null ? Number(c.lifetime_budget) : null,
        totals: sumInsights(rowsByCampaign.get(c.id) ?? []),
      });
    }
    return snapshot;
  } catch (err: any) {
    console.warn(`[CampaignEvents] snapshot failed for ad_account=${adAccountId}: ${err?.message || err}`);
    return null;
  }
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

function fmt(n: number, currency: string | null) {
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

const TRAFFIC_OBJECTIVES = new Set(['OUTCOME_TRAFFIC', 'LINK_CLICKS', 'TRAFFIC']);

/** Pure diff: exported for testing. */
export function diffSnapshots(params: {
  organizationId: string;
  before: AccountSnapshot;
  after: AccountSnapshot;
  currency: string | null;
  syncedAt: Date;
}): CampaignEventInsert[] {
  const { organizationId, before, after, currency, syncedAt } = params;
  const occurred_at = syncedAt.toISOString();
  const runKey = occurred_at.slice(0, 16); // minute bucket for per-run events
  const events: CampaignEventInsert[] = [];

  for (const [id, now] of after) {
    const prev = before.get(id);
    if (!prev) continue; // newly discovered campaigns are not "updates"

    // 1. Status / completion
    if (prev.derived_status !== now.derived_status) {
      if (now.derived_status === 'COMPLETED') {
        events.push({
          organization_id: organizationId,
          campaign_id: id,
          event_type: 'campaign_completed',
          severity: 'success',
          title: `${now.name} has completed`,
          body: `Final spend ${fmt(now.totals.spend ?? 0, currency)}.`,
          metadata: { from: prev.derived_status, to: now.derived_status, totals: now.totals },
          dedupe_key: `${id}:completed`,
          occurred_at,
        });
      } else {
        const warn = now.derived_status === 'REJECTED' || now.derived_status === 'PAUSED';
        events.push({
          organization_id: organizationId,
          campaign_id: id,
          event_type: 'status_changed',
          severity: warn ? 'warning' : now.derived_status === 'ACTIVE' ? 'success' : 'info',
          title: `${now.name} is now ${now.derived_status.toLowerCase().replace('_', ' ')}`,
          body: `Status changed from ${prev.derived_status.toLowerCase().replace('_', ' ')}.`,
          metadata: { from: prev.derived_status, to: now.derived_status, effective_status: now.effective_status },
          dedupe_key: `${id}:status:${prev.derived_status}->${now.derived_status}:${runKey}`,
          occurred_at,
        });
      }
    }

    // 2. New results since the previous sync
    const keys = resultColumns(now.totals);
    if (now.objective && TRAFFIC_OBJECTIVES.has(now.objective.toUpperCase())) keys.push('clicks');
    const deltas: Record<string, number> = {};
    for (const k of keys) {
      const d = Math.round((now.totals[k] ?? 0) - (prev.totals[k] ?? 0));
      if (d > 0) deltas[k] = d;
    }
    if (Object.keys(deltas).length > 0) {
      const parts = Object.entries(deltas).map(([k, d]) => `+${d.toLocaleString('en-US')} ${metricLabel(k)}`);
      events.push({
        organization_id: organizationId,
        campaign_id: id,
        event_type: 'new_results',
        severity: 'success',
        title: `${now.name}: ${parts.join(', ')}`,
        body: null,
        metadata: { deltas, spend_delta: Math.round(((now.totals.spend ?? 0) - (prev.totals.spend ?? 0)) * 100) / 100 },
        dedupe_key: `${id}:results:${runKey}`,
        occurred_at,
      });
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
          organization_id: organizationId,
          campaign_id: id,
          event_type: 'budget_milestone',
          severity: top === 100 ? 'warning' : 'info',
          title: `${now.name} has used ${top}% of its budget`,
          body: `${fmt(spendNow, currency)} of ${fmt(now.lifetime_budget, currency)} spent.`,
          metadata: { percent: top, spend: spendNow, lifetime_budget: now.lifetime_budget },
          dedupe_key: `${id}:budget:${top}`,
          occurred_at,
        });
      }
    }

    // 4. Absolute spend milestones
    const crossedSteps = spendSteps(spendNow).filter((s) => spendPrev < s && spendNow >= s);
    const step = crossedSteps.at(-1);
    if (step) {
      events.push({
        organization_id: organizationId,
        campaign_id: id,
        event_type: 'spend_milestone',
        severity: 'info',
        title: `${now.name} passed ${fmt(step, currency)} in spend`,
        body: `Total spend is now ${fmt(spendNow, currency)}.`,
        metadata: { milestone: step, spend: spendNow },
        dedupe_key: `${id}:spend:${step}`,
        occurred_at,
      });
    }
  }
  return events;
}

export async function recordCampaignEvents(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    adAccountId: string;
    before: AccountSnapshot | null;
    currency?: string | null;
  }
): Promise<number> {
  try {
    if (!params.before) return 0;
    const after = await snapshotAccountCampaigns(supabase, params.adAccountId);
    if (!after) return 0;

    const events = diffSnapshots({
      organizationId: params.organizationId,
      before: params.before,
      after,
      currency: params.currency ?? null,
      syncedAt: new Date(),
    });
    if (events.length === 0) return 0;

    const { error } = await supabase
      .from('campaign_events')
      .upsert(events, { onConflict: 'dedupe_key', ignoreDuplicates: true });
    if (error) throw error;
    return events.length;
  } catch (err: any) {
    // e.g. migration not applied yet: never fail the sync because of the feed.
    console.warn(`[CampaignEvents] record failed for ad_account=${params.adAccountId}: ${err?.message || err}`);
    return 0;
  }
}
