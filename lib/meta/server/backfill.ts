import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, dayIn, isIsoDay } from '@/lib/dates';
import { computeInsightGap } from '@/lib/meta/insight-gap';

export { addDays, dayIn, isIsoDay };

/**
 * Finds the span of days (in the ad account timezone) on which a currently-delivering
 * campaign has NO insights row, within the last `lookbackDays` (excluding D0–D2, which
 * the regular sync refreshes anyway). Gaps appear whenever syncs stop, e.g. while the
 * Meta token was expired, and make spend/impressions/results lower than Ads Manager.
 *
 * Returns one {since, until} covering all gaps (one ranged Meta call), or null.
 */
export async function findInsightGap(
    supabase: SupabaseClient,
    params: { adAccountId: string; timeZone: string; lookbackDays?: number; now?: Date }
): Promise<{ since: string; until: string } | null> {
    const today = dayIn(params.timeZone, params.now);
    const windowStart = addDays(today, -(params.lookbackDays ?? 37));
    const windowEnd = addDays(today, -3);
    if (windowEnd < windowStart) return null;

    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, status, effective_status, start_time, end_time')
        .eq('ad_account_id', params.adAccountId);
    if (error || !campaigns?.length) return null;

    const live = campaigns.filter((c) => (c.effective_status || c.status || '').toUpperCase() === 'ACTIVE');
    if (live.length === 0) return null;

    const { data: rows, error: rowsErr } = await supabase
        .from('campaign_insights')
        .select('campaign_id, date')
        .in('campaign_id', live.map((c) => c.id))
        .gte('date', windowStart)
        .lte('date', windowEnd)
        .limit(5000);
    if (rowsErr) return null;

    return computeInsightGap({
        campaigns: live,
        have: new Set((rows || []).map((r) => `${r.campaign_id}:${r.date}`)),
        windowStart,
        windowEnd,
        timeZone: params.timeZone,
    });
}
