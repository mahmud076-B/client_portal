export type PeriodWindow = { since: string; until: string } | { preset: 'maximum' };

/** Longest a cached Meta total may be shown. */
export const PERIOD_TOTALS_MAX_AGE_S = 60;

/**
 * Cache key for one campaign + window within one freshness bucket.
 *
 * unstable_cache is stale-while-revalidate: once an entry expires, the NEXT request still
 * receives the old value and only triggers a background refresh. On Vercel the Data Cache also
 * outlives deployments. So a client opening the dashboard after a quiet hour got hour-old (or
 * pre-fix) totals on the first load and correct ones only after refreshing. Putting the time
 * bucket in the key means an expired entry is never looked up again: a stale value cannot be served.
 */
export function periodTotalsCacheKey(
    organizationId: string,
    metaCampaignId: string,
    window: PeriodWindow,
    nowMs: number = Date.now()
): string[] {
    const w = 'preset' in window ? 'maximum' : `${window.since}..${window.until}`;
    const bucket = Math.floor(nowMs / (PERIOD_TOTALS_MAX_AGE_S * 1000));
    return ['meta-period-totals-v2', organizationId, metaCampaignId, w, String(bucket)];
}

