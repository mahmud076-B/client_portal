import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetaServerClient, type CampaignPeriodTotals } from '@/lib/meta/server/client';
import {
    PERIOD_TOTALS_MAX_AGE_S,
    RANGE_PRESETS,
    allRangesCacheKey,
    type PeriodWindow,
    type PresetRange,
} from '@/lib/meta/period-cache-key';

export type { PeriodWindow, PresetRange };
export type RangeTotals = Partial<Record<PresetRange, CampaignPeriodTotals>>;

const PRESET_TO_RANGE = Object.fromEntries(Object.entries(RANGE_PRESETS).map(([r, p]) => [p, r])) as Record<string, PresetRange>;

async function metaClientFor(organizationId: string): Promise<MetaServerClient> {
    const { data: conn } = await createAdminClient()
        .from('meta_connections')
        .select('encrypted_token, iv, auth_tag')
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .single();
    if (!conn?.encrypted_token || !conn?.iv || !conn?.auth_tag) throw new Error('No connected Meta token');
    return new MetaServerClient({ encryptedToken: conn.encrypted_token, iv: conn.iv, authTag: conn.auth_tag });
}

/** ONE Meta round trip for every dashboard range of a campaign. Throws (never cached) on failure. */
async function fetchAllRanges(organizationId: string, metaCampaignId: string): Promise<RangeTotals> {
    const client = await metaClientFor(organizationId);
    const byPreset = await client.getCampaignPresetTotals(metaCampaignId, Object.values(RANGE_PRESETS));
    const out: RangeTotals = {};
    for (const [preset, totals] of Object.entries(byPreset)) out[PRESET_TO_RANGE[preset]] = totals;
    if (!out.maximum) throw new Error('Meta range totals incomplete');
    return out;
}

/**
 * Ads Manager-equivalent totals for ALL dashboard ranges of one campaign (today, 7d, 14d, 30d,
 * Max), fetched in one Graph batch call and cached together for at most PERIOD_TOTALS_MAX_AGE_S
 * (time-bucketed key: an expired entry is never served, see period-cache-key.ts). The first view of
 * a campaign pays one Meta round trip; every range switch after that is a cache hit.
 * Returns null when Meta is unreachable; callers fall back to synced DB rows.
 */
export async function getCampaignRangeTotalsCached(organizationId: string, metaCampaignId: string): Promise<RangeTotals | null> {
    try {
        return await unstable_cache(
            () => fetchAllRanges(organizationId, metaCampaignId),
            allRangesCacheKey(organizationId, metaCampaignId),
            { revalidate: PERIOD_TOTALS_MAX_AGE_S * 2 }
        )();
    } catch (err: any) {
        console.error(`[Dashboard] Meta range totals failed for campaign ${metaCampaignId}: ${err?.message || err}`);
        return null;
    }
}

/** Fills the cache for other campaigns the client can switch to (run after the response). */
export async function warmCampaignRangeTotals(organizationId: string, metaCampaignIds: string[]): Promise<void> {
    await Promise.all(metaCampaignIds.map((id) => getCampaignRangeTotalsCached(organizationId, id)));
}
