import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, dayIn, isIsoDay } from '@/lib/dates';
import { computeInsightGap } from '@/lib/meta/insight-gap';

export { addDays, dayIn, isIsoDay };

/**
 * Finds the span of days (in the ad account timezone) on which a currently-delivering
 * campaign has NO insights row, within the last `lookbackDays` (default 90; excluding D0–D2, which
 * the regular sync refreshes anyway). Gaps appear whenever syncs stop, e.g. while the
 * Meta token was expired, and make spend/impressions/results lower than Ads Manager.
 *
 * Returns one {since, until} covering all gaps (one ranged Meta call), or null.
 */
export async function findInsightGap(
    supabase: SupabaseClient,
    params: { adAccountId: string; timeZone: string; lookbackDays?: number; now?: Date }
): Promise<{ since: string; until: string; campaignIds: string[] } | null> {
    const today = dayIn(params.timeZone, params.now);
    const windowStart = addDays(today, -(params.lookbackDays ?? 90));
    const windowEnd = addDays(today, -3);
    if (windowEnd < windowStart) return null;

    const base = 'id, status, effective_status, start_time, end_time';
    let { data: campaigns, error } = await supabase
        .from('campaigns')
        .select(`${base}, insights_backfilled_through`)
        .eq('ad_account_id', params.adAccountId);
    if (error) {
        // Migration 20261127000000 not applied yet.
        ({ data: campaigns, error } = (await supabase.from('campaigns').select(base).eq('ad_account_id', params.adAccountId)) as any);
    }
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

    const gap = computeInsightGap({
        campaigns: live,
        have: new Set((rows || []).map((r) => `${r.campaign_id}:${r.date}`)),
        windowStart,
        windowEnd,
        timeZone: params.timeZone,
    });
    return gap ? { ...gap, campaignIds: live.map((c) => c.id) } : null;
}

/** Records that Meta was asked for these campaigns' days through `until` (see insights_backfilled_through). */
export async function markBackfilled(supabase: SupabaseClient, campaignIds: string[], until: string) {
    if (campaignIds.length === 0) return;
    const { error } = await supabase.from('campaigns').update({ insights_backfilled_through: until }).in('id', campaignIds);
    if (error) console.warn(`[Sync] could not record backfill marker: ${error.message}`);
}
