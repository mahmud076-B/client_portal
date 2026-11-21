import { describe, expect, it } from 'vitest';
import { computeInsightGap } from '@/lib/meta/insight-gap';

const base = { windowStart: '2026-10-16', windowEnd: '2026-11-19', timeZone: 'Asia/Dhaka' };

describe('computeInsightGap (auto-backfill of days missed while syncs were down)', () => {
  it('Velora: started 15 Nov, only 20–22 Nov synced -> backfill 15–19 Nov', () => {
    const have = new Set(['v:2026-11-20', 'v:2026-11-21', 'v:2026-11-22']);
    expect(computeInsightGap({ ...base, campaigns: [{ id: 'v', start_time: '2026-11-15T00:00:00+0600', end_time: '2026-11-25T23:59:00+0600' }], have }))
      .toEqual({ since: '2026-11-15', until: '2026-11-19' });
  });
  it('complete data -> no gap (no extra Meta call)', () => {
    const have = new Set(['v:2026-11-18', 'v:2026-11-19']);
    expect(computeInsightGap({ ...base, campaigns: [{ id: 'v', start_time: '2026-11-18T00:00:00+0600' }], have })).toBeNull();
  });
  it('respects the campaign end date and the lookback window', () => {
    const c = [{ id: 'old', start_time: '2026-01-01T00:00:00Z', end_time: '2026-10-20T00:00:00+0600' }];
    expect(computeInsightGap({ ...base, campaigns: c, have: new Set() })).toEqual({ since: '2026-10-16', until: '2026-10-20' });
  });
  it('start date is read in the ad account timezone', () => {
    // 18:30 UTC on 14 Nov = 00:30 on 15 Nov in Dhaka
    const c = [{ id: 'x', start_time: '2026-11-14T18:30:00Z' }];
    const have = new Set(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].map((d) => `x:${d}`));
    expect(computeInsightGap({ ...base, campaigns: c, have })).toBeNull();
  });
});
