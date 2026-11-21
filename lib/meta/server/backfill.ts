import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD for `date` in `timeZone`. */
export function dayIn(timeZone: string, date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Calendar arithmetic on YYYY-MM-DD strings (UTC-safe). */
export function addDays(day: string, delta: number): string {
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
}

export function isIsoDay(v: string | null | undefined): v is string {
    return !!v && ISO.test(v);
}

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

    const have = new Set((rows || []).map((r) => `${r.campaign_id}:${r.date}`));
    let since: string | null = null;
    let until: string | null = null;

    for (const c of live) {
        const start = c.start_time ? dayIn(params.timeZone, new Date(c.start_time)) : windowStart;
        const end = c.end_time ? dayIn(params.timeZone, new Date(c.end_time)) : windowEnd;
        const from = start > windowStart ? start : windowStart;
        const to = end < windowEnd ? end : windowEnd;
        for (let d = from; d <= to; d = addDays(d, 1)) {
            if (!have.has(`${c.id}:${d}`)) {
                if (!since || d < since) since = d;
                if (!until || d > until) until = d;
            }
        }
    }
    return since && until ? { since, until } : null;
}
