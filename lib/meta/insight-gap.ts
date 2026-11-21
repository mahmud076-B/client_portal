import { addDays, dayIn } from '@/lib/dates';

/**
 * Pure: the single span covering every day in [windowStart, windowEnd] on which a
 * campaign (within its own start/end) has no synced insights row. null = no gap.
 * `have` holds "campaignId:YYYY-MM-DD" keys.
 */
export function computeInsightGap(params: {
    campaigns: { id: string; start_time?: string | null; end_time?: string | null; insights_backfilled_through?: string | null }[];
    have: Set<string>;
    windowStart: string;
    windowEnd: string;
    timeZone: string;
}): { since: string; until: string } | null {
    const { campaigns, have, windowStart, windowEnd, timeZone } = params;
    let since: string | null = null;
    let until: string | null = null;
    for (const c of campaigns) {
        const start = c.start_time ? dayIn(timeZone, new Date(c.start_time)) : windowStart;
        const end = c.end_time ? dayIn(timeZone, new Date(c.end_time)) : windowEnd;
        // Days already asked for: a missing row there means zero delivery, not a sync gap.
        const checked = c.insights_backfilled_through ? addDays(c.insights_backfilled_through, 1) : null;
        let from = start > windowStart ? start : windowStart;
        if (checked && checked > from) from = checked;
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

/** Days before today that are re-read every run: Meta keeps attributing conversions to past days
 * (7-day click window), so D-9..D-3 still change and must match Ads Manager. D0–D2 are read separately. */
export const SETTLE_DAYS_BACK = 9;
export const RECENT_DAYS = 3;

/**
 * Pure: the single historical range the cron reads each run, and the day through which every
 * live campaign is then known to be complete (the backfill marker).
 * - always covers D-9..D-3 (late attribution, and fields added later such as inline_link_clicks);
 * - extends back to the start of any gap (days missed while syncs were down).
 * The marker is the END of the range, not the last missing day, so a day that already had a row
 * (but stale or missing fields) can never be left behind the marker.
 */
export function planHistoricalRange(params: { today: string; gap: { since: string; until: string } | null }) {
    const until = addDays(params.today, -RECENT_DAYS);
    const settleStart = addDays(params.today, -SETTLE_DAYS_BACK);
    const since = params.gap && params.gap.since < settleStart ? params.gap.since : settleStart;
    return { since, until, markThrough: until };
}
