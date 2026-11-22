import { describe, expect, it } from 'vitest';
import { resolveDashboardRange, rangeWindow } from '@/lib/campaigns/dashboard-totals';
import { periodTotalsCacheKey, PERIOD_TOTALS_MAX_AGE_S } from '@/lib/meta/period-cache-key';

describe('dashboard range: every visit starts on Max (lifetime)', () => {
  it('fresh visit without a range -> Max', () => {
    expect(resolveDashboardRange({ requested: null, inSessionNavigation: false })).toEqual({ range: 'maximum', resetUrl: false });
  });
  it('fresh visit with an old ?range=7 / ?days=7 in the URL -> Max, and the URL is reset', () => {
    expect(resolveDashboardRange({ requested: '7', inSessionNavigation: false })).toEqual({ range: 'maximum', resetUrl: true });
    expect(resolveDashboardRange({ requested: '30', inSessionNavigation: false })).toEqual({ range: 'maximum', resetUrl: true });
  });
  it('in-session choice is kept (range click, campaign switch with a chosen range)', () => {
    expect(resolveDashboardRange({ requested: '7', inSessionNavigation: true })).toEqual({ range: '7', resetUrl: false });
    expect(resolveDashboardRange({ requested: 'today', inSessionNavigation: true }).range).toBe('today');
  });
  it('in-session navigation without a range (campaign switch default) or with junk -> Max', () => {
    expect(resolveDashboardRange({ requested: null, inSessionNavigation: true }).range).toBe('maximum');
    expect(resolveDashboardRange({ requested: '999', inSessionNavigation: true }).range).toBe('maximum');
  });
  it('Max is lifetime: no lower date bound', () => {
    expect(rangeWindow('maximum', '2026-11-22').until).toBe('2026-11-22');
  });
});

describe('live Meta totals cache never serves a stale value', () => {
  const t0 = Date.UTC(2026, 10, 22, 16, 0, 0);
  it('same campaign/window within the freshness window -> same key (fast navigation)', () => {
    expect(periodTotalsCacheKey('o', 'c', { preset: 'maximum' }, t0)).toEqual(periodTotalsCacheKey('o', 'c', { preset: 'maximum' }, t0 + 10_000));
  });
  it('after the freshness window -> new key, so the old entry is never returned (no stale-while-revalidate)', () => {
    expect(periodTotalsCacheKey('o', 'c', { preset: 'maximum' }, t0)).not.toEqual(
      periodTotalsCacheKey('o', 'c', { preset: 'maximum' }, t0 + PERIOD_TOTALS_MAX_AGE_S * 1000)
    );
  });
  it('keys differ per campaign and per window', () => {
    const a = periodTotalsCacheKey('o', 'c1', { preset: 'maximum' }, t0).join('|');
    expect(periodTotalsCacheKey('o', 'c2', { preset: 'maximum' }, t0).join('|')).not.toBe(a);
    expect(periodTotalsCacheKey('o', 'c1', { since: '2026-11-15', until: '2026-11-21' }, t0).join('|')).not.toBe(a);
  });
});
