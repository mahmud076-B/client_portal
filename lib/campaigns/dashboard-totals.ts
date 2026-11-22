/**
 * Pure dashboard aggregation (unit-tested): picks the source of truth for KPI totals
 * and the objective-aware result.
 *
 * - When Meta period totals are available (one aggregated insights query for the exact
 *   window), every KPI comes from them, so spend, impressions, de-duplicated reach,
 *   frequency and results describe the SAME period and match Ads Manager.
 * - Otherwise totals are summed from the synced daily rows; reach is then unknown
 *   (daily reach is not additive), never mixed with a different source.
 */
import { addDays } from '@/lib/dates';
import { linkMetrics, rowLinkClicks } from '@/lib/campaigns/metrics';
import { computeResult, resolveResultSpec, resolveResultSpecForData, type ComputedResult, type InsightRow, type ResultSpec } from '@/lib/meta/results';

export type DashboardRange = 'today' | '7' | '14' | '30' | 'maximum';

/** Every visit starts on lifetime ("Max"), so clients never mistake 7 days for the whole result. */
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = 'maximum';
const RANGES: readonly DashboardRange[] = ['today', '7', '14', '30', 'maximum'];

/** The range to render for a URL value: a valid choice, else Max. */
export function resolveDashboardRange(requested: string | null | undefined): DashboardRange {
    return (RANGES as readonly string[]).includes(requested ?? '') ? (requested as DashboardRange) : DEFAULT_DASHBOARD_RANGE;
}

/**
 * Client side, on the dashboard's FIRST mount in this document (login redirect, typed or
 * bookmarked URL, full reload): a non-Max range in the URL is dropped so the visit starts on Max.
 * Later mounts/renders in the same document (range clicks, campaign switches) keep the choice.
 */
export function shouldResetRangeOnMount(params: { firstMountInDocument: boolean; urlRange: string | null }): boolean {
    return params.firstMountInDocument && params.urlRange !== null && resolveDashboardRange(params.urlRange) !== DEFAULT_DASHBOARD_RANGE;
}

/** URL query for the dashboard without any range (keeps the selected campaign). */
export function withoutRange(query: string): string {
    const p = new URLSearchParams(query);
    p.delete('range');
    p.delete('days');
    const q = p.toString();
    return q ? `?${q}` : '';
}

/**
 * Ads Manager presets, in the ad account timezone: "Last N days" = the N full days
 * BEFORE today (today excluded), e.g. on 22 Nov "Last 7 days" = 15–21 Nov. "today" = today.
 */
export function rangeWindow(range: DashboardRange, today: string): { since: string; until: string } {
    if (range === '7' || range === '14' || range === '30') {
        const n = parseInt(range, 10);
        return { since: addDays(today, -n), until: addDays(today, -1) };
    }
    return { since: today, until: today };
}

export interface MetaPeriodTotals {
    spend: number;
    impressions: number;
    reach: number | null;
    clicks: number;
    /** Link clicks (Ads Manager "Link clicks"; inline_link_clicks). */
    link_clicks: number;
    frequency: number | null;
    actions: unknown[];
    action_values: unknown[];
    video_thruplays: number | null;
    date_start?: string | null;
    date_stop?: string | null;
}

export type DashboardRow = InsightRow & { clicks?: number | string | null };

export interface DashboardTotals {
    spend: number;
    impressions: number;
    reach: number | null;
    clicks: number;
    linkClicks: number;
    frequency: number | null;
    /** Cost per LINK click, as Ads Manager's "CPC (cost per link click)". */
    cpc: number | null;
    cpm: number | null;
    /** Link click-through rate (%), as Ads Manager's "CTR (link click-through rate)". null = no impressions. */
    ctr: number | null;
    /** Ads Manager "CPC (all)" and "CTR (all)" (all clicks), for views that use those columns. */
    cpcAll: number | null;
    ctrAll: number | null;
    source: 'meta' | 'synced';
}


const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

export function buildDashboardTotals(params: {
    campaign: { objective?: string | null; optimization_goal?: string | null };
    rows: DashboardRow[];
    meta: MetaPeriodTotals | null;
    endDate: string;
}): { totals: DashboardTotals; resultSpec: ResultSpec | null; result: ComputedResult | null } {
    const { campaign, rows, meta } = params;

    const synced = rows.reduce(
        (s, r) => ({
            spend: s.spend + num(r.spend),
            impressions: s.impressions + num(r.impressions),
            clicks: s.clicks + num(r.clicks),
            linkClicks: s.linkClicks + rowLinkClicks(r as unknown as Record<string, unknown>),
            messaging: s.messaging + num(r.messaging_conversations_started),
        }),
        { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, messaging: 0 }
    );

    const spend = meta ? meta.spend : synced.spend;
    const impressions = meta ? meta.impressions : synced.impressions;
    const clicks = meta ? meta.clicks : synced.clicks;
    const linkClicks = meta ? meta.link_clicks : synced.linkClicks;
    const reach = meta ? meta.reach : null;
    const frequency = meta?.frequency ?? (reach && impressions ? impressions / reach : null);

    const resultSpec =
        resolveResultSpecForData(campaign.objective, campaign.optimization_goal, [
            ...rows,
            ...(meta ? [{ actions: meta.actions }] : []),
        ]) ?? resolveResultSpec(synced.messaging > 0 ? 'MESSAGES' : 'OUTCOME_TRAFFIC');

    let result: ComputedResult | null = null;
    if (resultSpec) {
        const resultRows: InsightRow[] = meta
            ? [{
                date: meta.date_stop || params.endDate,
                spend, impressions, reach,
                actions: meta.actions,
                action_values: meta.action_values,
                video_thruplays: meta.video_thruplays,
            }]
            : rows;
        result = computeResult(resultSpec, resultRows, { totalSpend: spend, periodReach: reach, totalImpressions: impressions });
        // Charts keep the per-day series from the synced rows.
        if (meta) result.daily = computeResult(resultSpec, rows, { totalSpend: synced.spend }).daily;
    }

    return {
        totals: {
            spend,
            impressions,
            reach,
            clicks,
            linkClicks,
            frequency,
            ...(() => {
                const m = linkMetrics({ spend, impressions, clicks, linkClicks });
                return { cpc: m.cpc_link, ctr: m.ctr_link_percent, cpcAll: m.cpc_all, ctrAll: m.ctr_all_percent, cpm: m.cpm };
            })(),
            source: meta ? 'meta' : 'synced',
        },
        resultSpec,
        result,
    };
}

export const DASHBOARD_RANGES: readonly DashboardRange[] = RANGES;

/** Lifetime daily rows -> the rows inside one range window (Max = all). */
export function rowsInRange<T extends { date?: unknown }>(rows: T[], range: DashboardRange, today: string): T[] {
    if (range === 'maximum') return rows;
    const w = rangeWindow(range, today);
    return rows.filter((r) => String(r.date) >= w.since && String(r.date) <= w.until);
}

/**
 * Totals for EVERY range in one payload, so switching range on the dashboard is a pure client
 * update (no server round trip). Each range uses its own Meta preset totals when available.
 */
export function buildRangeAggregates(params: {
    campaign: Parameters<typeof buildDashboardTotals>[0]['campaign'];
    rows: DashboardRow[];
    metaByRange: Partial<Record<DashboardRange, MetaPeriodTotals>> | null;
    today: string;
    currency: string | null;
}) {
    const byRange = {} as Record<DashboardRange, ReturnType<typeof buildDashboardTotals>['totals'] & {
        result: ReturnType<typeof buildDashboardTotals>['result'];
        currency: string | null;
        period: { since: string | null; until: string | null };
    }>;
    let messagingSpec = false;
    for (const range of RANGES) {
        const rows = rowsInRange(params.rows, range, params.today);
        const meta = params.metaByRange?.[range] ?? null;
        const w = rangeWindow(range, params.today);
        const { totals, resultSpec, result } = buildDashboardTotals({ campaign: params.campaign, rows, meta, endDate: w.until });
        if (range === 'maximum' && resultSpec?.key === 'messaging') messagingSpec = true;
        byRange[range] = {
            ...totals,
            result,
            currency: params.currency,
            period: range === 'maximum'
                ? { since: meta?.date_start ?? rows[0]?.date ?? null, until: meta?.date_stop ?? rows.at(-1)?.date ?? null }
                : { since: w.since, until: w.until },
        };
    }
    return { byRange, messagingSpec };
}
