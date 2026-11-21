/**
 * Shared, dependency-free helpers for summarising campaign_insights rows.
 *
 * Totals are computed generically over every numeric column, so result
 * columns added by other migrations (follows, purchases, video views, ...)
 * are picked up automatically without changing this file.
 */

/** Columns that are identifiers/timestamps or per-row ratios, never summed. */
const NON_SUMMABLE = new Set([
  'id',
  'campaign_id',
  'date',
  'created_at',
  'updated_at',
  'cpc',
  'cpm',
  'ctr',
]);

/** Ratio/cost columns are recomputed from totals instead of summed. */
function isRatioColumn(key: string) {
  return (
    NON_SUMMABLE.has(key) ||
    key.startsWith('cost_per_') ||
    key.endsWith('_rate') ||
    key === 'frequency' ||
    key === 'roas' ||
    key.endsWith('_roas')
  );
}

/** Columns describing delivery/spend rather than outcomes. */
const DELIVERY_COLUMNS = new Set(['spend', 'impressions', 'reach', 'clicks']);

export type InsightRow = Record<string, unknown>;
export type MetricTotals = Record<string, number>;

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Meta `actions` / `action_values` arrays (AdsActionStats[]) if present are
 * flattened into `actions.<action_type>` / `action_values.<action_type>` totals.
 */
const ACTION_ARRAYS = new Set(['actions', 'action_values']);

/** Action types that count as a client-facing "result" (others are engagement noise). */
const RESULT_ACTION_LABELS: Record<string, string> = {
  'actions.onsite_conversion.messaging_conversation_started_7d': 'messaging conversations',
  'actions.like': 'page likes',
  'actions.onsite_conversion.follow': 'follows',
  'actions.follow': 'follows',
  'actions.omni_purchase': 'purchases',
  'actions.purchase': 'purchases',
  'actions.offsite_conversion.fb_pixel_purchase': 'website purchases',
  'actions.lead': 'leads',
  'actions.onsite_conversion.lead_grouped': 'leads',
  'actions.complete_registration': 'registrations',
  'actions.landing_page_view': 'landing page views',
};

export function sumInsights(rows: InsightRow[]): MetricTotals {
  const totals: MetricTotals = {};
  for (const row of rows) {
    for (const [key, raw] of Object.entries(row)) {
      if (ACTION_ARRAYS.has(key) && Array.isArray(raw)) {
        for (const a of raw as { action_type?: string; value?: unknown }[]) {
          const n = toNumber(a?.value);
          if (!a?.action_type || n === null) continue;
          const k = `${key}.${a.action_type}`;
          totals[k] = (totals[k] ?? 0) + n;
        }
        continue;
      }
      if (isRatioColumn(key)) continue;
      const n = toNumber(raw);
      if (n === null) continue;
      totals[key] = (totals[key] ?? 0) + n;
    }
  }
  // Round money to 2dp to avoid float noise.
  if (totals.spend !== undefined) totals.spend = Math.round(totals.spend * 100) / 100;
  return totals;
}

/** Derived ratios (CPC/CPM/CTR and cost per each result column). */
export function deriveRatios(t: MetricTotals): Record<string, number | null> {
  const spend = t.spend ?? 0;
  const out: Record<string, number | null> = {
    ctr_percent: t.impressions ? round((t.clicks ?? 0) / t.impressions * 100, 2) : null,
    cpc: t.clicks ? round(spend / t.clicks, 2) : null,
    cpm: t.impressions ? round(spend / t.impressions * 1000, 2) : null,
  };
  for (const key of resultColumns(t)) {
    out[`cost_per_${key}`] = t[key] ? round(spend / t[key], 2) : null;
  }
  const purchaseValue = t['action_values.omni_purchase'] ?? t['action_values.purchase'] ?? t['action_values.offsite_conversion.fb_pixel_purchase'];
  if (purchaseValue !== undefined) out.purchase_roas = spend ? round(purchaseValue / spend, 2) : null;
  return out;
}

/** Outcome counters present in the totals (everything that is not delivery). */
export function resultColumns(t: MetricTotals): string[] {
  return Object.keys(t).filter((k) => {
    if (k === 'actions.onsite_conversion.messaging_conversation_started_7d' && 'messaging_conversations_started' in t) return false;
    if (k.startsWith('actions.')) return k in RESULT_ACTION_LABELS;
    if (k.startsWith('action_values.')) return false;
    return !DELIVERY_COLUMNS.has(k) && !k.includes('value');
  });
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Campaign status lives in one place: lib/meta/results.ts (deriveDeliveryStatus).
 * Use `deriveDeliveryStatus(c).code` for the coarse status.
 */
export type { DerivedStatus } from '@/lib/meta/results';

/** Human label for a metric column name, e.g. messaging_conversations_started -> "messaging conversations started". */
export function metricLabel(key: string) {
  return RESULT_ACTION_LABELS[key] ?? key.replace(/^actions\./, '').replace(/[_.]/g, ' ');
}
