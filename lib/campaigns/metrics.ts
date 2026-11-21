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

export function sumInsights(rows: InsightRow[]): MetricTotals {
  const totals: MetricTotals = {};
  for (const row of rows) {
    for (const [key, raw] of Object.entries(row)) {
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
  return out;
}

/** Outcome counters present in the totals (everything that is not delivery). */
export function resultColumns(t: MetricTotals): string[] {
  return Object.keys(t).filter((k) => !DELIVERY_COLUMNS.has(k) && !k.includes('value'));
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export type DerivedStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'DELETED' | 'IN_REVIEW' | 'REJECTED' | 'OTHER';

/**
 * Meta keeps effective_status = ACTIVE after a campaign's stop time, so a
 * campaign whose end_time is in the past is treated as COMPLETED.
 */
export function deriveStatus(
  c: { status?: string | null; effective_status?: string | null; end_time?: string | null },
  now: Date = new Date()
): DerivedStatus {
  const eff = (c.effective_status || c.status || '').toUpperCase();
  if (eff === 'DELETED') return 'DELETED';
  if (eff === 'ARCHIVED') return 'ARCHIVED';
  if (c.end_time && new Date(c.end_time).getTime() < now.getTime()) return 'COMPLETED';
  if (eff === 'ACTIVE') return 'ACTIVE';
  if (eff.includes('PAUSED')) return 'PAUSED';
  if (eff === 'IN_PROCESS' || eff === 'PENDING_REVIEW') return 'IN_REVIEW';
  if (eff === 'DISAPPROVED' || eff === 'WITH_ISSUES') return 'REJECTED';
  return 'OTHER';
}

/** Human label for a metric column name, e.g. messaging_conversations_started -> "messaging conversations started". */
export function metricLabel(key: string) {
  return key.replace(/_/g, ' ');
}
