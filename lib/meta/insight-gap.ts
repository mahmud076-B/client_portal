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
