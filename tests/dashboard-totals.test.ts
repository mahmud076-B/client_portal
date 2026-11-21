import { describe, expect, it } from 'vitest';
import { buildDashboardTotals, rangeWindow, type MetaPeriodTotals } from '@/lib/campaigns/dashboard-totals';
import { addDays, dayIn } from '@/lib/dates';

const act = (pairs: Record<string, number>) => Object.entries(pairs).map(([action_type, value]) => ({ action_type, value: String(value) }));

describe('date ranges (Ads Manager presets, account timezone)', () => {
  it('Last 7 days on 22 Nov = 15–21 Nov (today excluded)', () => {
    expect(rangeWindow('7', '2026-11-22')).toEqual({ since: '2026-11-15', until: '2026-11-21' });
  });
  it('14 / 30 days and today', () => {
    expect(rangeWindow('14', '2026-11-22')).toEqual({ since: '2026-11-08', until: '2026-11-21' });
    expect(rangeWindow('30', '2026-03-01')).toEqual({ since: '2026-01-30', until: '2026-02-28' });
    expect(rangeWindow('today', '2026-11-22')).toEqual({ since: '2026-11-22', until: '2026-11-22' });
  });
  it('"today" follows the ad account timezone, not the server', () => {
    const t = new Date('2026-11-21T19:30:00Z'); // 01:30 on 22 Nov in Dhaka
    expect(dayIn('Asia/Dhaka', t)).toBe('2026-11-22');
    expect(dayIn('America/Los_Angeles', t)).toBe('2026-11-21');
    expect(dayIn('Not/AZone', t)).toBe('2026-11-21');
  });
  it('addDays crosses months/years', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

// Ads Manager ground truth, Velora Glow Ad (21$), Maximum, read 22 Nov 2026 01:29 Dhaka.
const VELORA_LIFETIME: MetaPeriodTotals = {
  spend: 18.47, impressions: 52259, reach: 33088, clicks: 2100, link_clicks: 994, frequency: 1.58,
  actions: act({ 'onsite_conversion.messaging_conversation_started_7d': 600, post_engagement: 1724, link_click: 994 }),
  action_values: [], video_thruplays: 0, date_start: '2026-11-15', date_stop: '2026-11-22',
};

describe('buildDashboardTotals', () => {
  it('uses Meta period totals for every KPI so they match Ads Manager', () => {
    // Partial synced rows (the bug: only a few days in the DB) must not leak into the totals.
    const rows = [{ date: '2026-11-21', spend: 4.7, impressions: 15652, clicks: 2024, actions: act({ post_engagement: 1724 }) }];
    const { totals, result } = buildDashboardTotals({
      campaign: { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: null }, rows, meta: VELORA_LIFETIME, endDate: '2026-11-22',
    });
    expect(totals.source).toBe('meta');
    expect(totals.spend).toBe(18.47);
    expect(totals.impressions).toBe(52259);
    expect(totals.reach).toBe(33088);
    expect(totals.frequency).toBe(1.58);
    expect(totals.cpm).toBeCloseTo(0.353, 3);
    expect(totals.cpc).toBeCloseTo(0.0186, 4);            // spend / link clicks
    expect(totals.ctr).toBeCloseTo((994 / 52259) * 100, 6); // link CTR
    expect(result?.spec.key).toBe('messaging');
    expect(result?.total).toBe(600);
    expect(result?.costPerResult).toBeCloseTo(0.0308, 4);
    expect(totals.reach! >= 0 && totals.impressions >= totals.reach!).toBe(true);
  });

  it('falls back to synced rows (sums spend/impressions/link clicks, reach unknown)', () => {
    const rows = [
      { date: '2026-11-20', spend: 2, impressions: 1000, clicks: 30, actions: act({ link_click: 10, 'onsite_conversion.messaging_conversation_started_7d': 20 }) },
      { date: '2026-11-21', spend: '3.5', impressions: '1500', clicks: '45', actions: act({ link_click: 12, 'onsite_conversion.messaging_conversation_started_7d': 30 }) },
    ];
    const { totals, result } = buildDashboardTotals({ campaign: { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS' }, rows, meta: null, endDate: '2026-11-21' });
    expect(totals.source).toBe('synced');
    expect(totals.spend).toBeCloseTo(5.5);
    expect(totals.impressions).toBe(2500);
    expect(totals.linkClicks).toBe(22);
    expect(totals.reach).toBeNull();
    expect(totals.frequency).toBeNull();
    expect(result?.total).toBe(50);
    expect(result?.costPerResult).toBeCloseTo(0.11);
  });

  it('no data at all -> zeros, no NaN/Infinity', () => {
    const { totals, result } = buildDashboardTotals({ campaign: { objective: null, optimization_goal: null }, rows: [], meta: null, endDate: '2026-11-22' });
    expect(totals.spend).toBe(0);
    expect(totals.cpc).toBeNull();
    expect(totals.cpm).toBeNull();
    expect(totals.ctr).toBe(0);
    expect(result?.costPerResult ?? null).toBeNull();
  });

  it('keeps the per-day chart series from synced rows when Meta totals are used', () => {
    const rows = [{ date: '2026-11-21', actions: act({ 'onsite_conversion.messaging_conversation_started_7d': 7 }) }];
    const { result } = buildDashboardTotals({ campaign: { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS' }, rows, meta: VELORA_LIFETIME, endDate: '2026-11-22' });
    expect(result?.daily).toEqual([{ date: '2026-11-21', value: 7 }]);
  });
});
