export type PeriodWindow = { since: string; until: string } | { preset: 'maximum' };

/**
 * Longest a cached Meta total may be shown. The cache key carries a time bucket of this size:
 * unstable_cache is stale-while-revalidate (and the Vercel Data Cache outlives deployments), so a
 * plain expiry served the OLD value on the first request after it lapsed. With the bucket in the
 * key an expired entry is never looked up again.
 */
export const PERIOD_TOTALS_MAX_AGE_S = 120;

/** Dashboard range -> Meta date_preset (ad account timezone, same as Ads Manager). */
export const RANGE_PRESETS = {
    today: 'today',
    '7': 'last_7d',
    '14': 'last_14d',
    '30': 'last_30d',
    maximum: 'maximum',
} as const;
export type PresetRange = keyof typeof RANGE_PRESETS;

/** One cache entry holds ALL ranges of one campaign, so switching range is a cache hit. */
export function allRangesCacheKey(organizationId: string, metaCampaignId: string, nowMs: number = Date.now()): string[] {
    const bucket = Math.floor(nowMs / (PERIOD_TOTALS_MAX_AGE_S * 1000));
    return ['meta-range-totals-v1', organizationId, metaCampaignId, String(bucket)];
}
