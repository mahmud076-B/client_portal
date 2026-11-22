import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetaServerClient, type CampaignPeriodTotals } from '@/lib/meta/server/client';

import { PERIOD_TOTALS_MAX_AGE_S, periodTotalsCacheKey, type PeriodWindow } from '@/lib/meta/period-cache-key';
export type { PeriodWindow };

/** Live Meta call; throws on failure so failures are never cached. */
async function fetchTotals(organizationId: string, metaCampaignId: string, window: PeriodWindow): Promise<CampaignPeriodTotals> {
    const { data: conn } = await createAdminClient()
        .from('meta_connections')
        .select('encrypted_token, iv, auth_tag')
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .single();
    if (!conn?.encrypted_token || !conn?.iv || !conn?.auth_tag) throw new Error('No connected Meta token');
    const client = new MetaServerClient({ encryptedToken: conn.encrypted_token, iv: conn.iv, authTag: conn.auth_tag });
    const totals = await client.getCampaignPeriodTotals(metaCampaignId, window);
    if (!totals) throw new Error('Meta period totals unavailable');
    return totals;
}

/**
 * Ads Manager-equivalent campaign totals for a period. At most PERIOD_TOTALS_MAX_AGE_S old,
 * shared across users/requests within that window so quick navigation does not wait on Meta.
 * Returns null when Meta is unreachable; callers fall back to synced DB rows.
 */
export async function getCampaignPeriodTotalsCached(
    organizationId: string,
    metaCampaignId: string,
    window: PeriodWindow
): Promise<CampaignPeriodTotals | null> {
    try {
        return await unstable_cache(
            () => fetchTotals(organizationId, metaCampaignId, window),
            periodTotalsCacheKey(organizationId, metaCampaignId, window),
            { revalidate: PERIOD_TOTALS_MAX_AGE_S * 2 }
        )();
    } catch (err: any) {
        console.error(`[Dashboard] Meta period totals failed for campaign ${metaCampaignId}: ${err?.message || err}`);
        return null;
    }
}
