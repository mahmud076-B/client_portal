import { describe, expect, it } from 'vitest';
import { resolveDashboardRange, rangeWindow, shouldResetRangeOnMount, withoutRange } from '@/lib/campaigns/dashboard-totals';
import { periodTotalsCacheKey, PERIOD_TOTALS_MAX_AGE_S } from '@/lib/meta/period-cache-key';

/**
 * Simulates one browser tab the way DashboardClient + page.tsx behave:
 * - the server renders whatever range the URL carries (no redirects);
 * - on the first mount in a document a non-Max URL range is replaced away;
 * - in-app clicks push URLs within the same document; reload/typed URL starts a new document.
 */
function tab(initialQuery: string) {
  let mountedInDocument = false;
  let query = initialQuery;
  const render = () => resolveDashboardRange(new URLSearchParams(query).get('range'));
  const mount = () => {
    const p = new URLSearchParams(query);
    if (shouldResetRangeOnMount({ firstMountInDocument: !mountedInDocument, urlRange: p.get('range') ?? p.get('days') })) {
      query = withoutRange(query).replace(/^\?/, ''); // router.replace
    }
    mountedInDocument = true;
  };
  mount();
  return {
    get range() { return render(); },
    get query() { return query; },
    pickRange(r: string) { const p = new URLSearchParams(query); p.set('range', r); query = p.toString(); },
    switchCampaign(id: string) { const p = new URLSearchParams(query); p.set('campaignId', id); query = p.toString(); },
    reload() { mountedInDocument = false; mount(); },
  };
}

describe('dashboard range: fresh visits start on Max, in-app choices stick', () => {
  it('fresh visit without a range -> Max', () => {
    expect(tab('campaignId=v').range).toBe('maximum');
  });
  it('fresh visit with a bookmarked ?range=7 / ?days=7 -> Max, URL cleaned (campaign kept)', () => {
    const t = tab('campaignId=v&range=7');
    expect(t.range).toBe('maximum');
    expect(t.query).toBe('campaignId=v');
    expect(tab('days=30').range).toBe('maximum');
  });
  it('in-app: clicking 7d sticks (the PR #12 regression bounced it back to Max)', () => {
    const t = tab('campaignId=v');
    t.pickRange('7');
    expect(t.range).toBe('7');
    expect(t.query).toBe('campaignId=v&range=7');
  });
  it('in-app: switching campaign keeps the chosen range; switching without a choice stays on Max', () => {
    const t = tab('campaignId=v');
    t.switchCampaign('joss');
    expect(t.range).toBe('maximum');
    t.pickRange('14');
    t.switchCampaign('green');
    expect(t.range).toBe('14');
    expect(t.query).toContain('campaignId=green');
  });
  it('full reload after an in-app choice -> back to Max', () => {
    const t = tab('campaignId=v');
    t.pickRange('7');
    t.reload();
    expect(t.range).toBe('maximum');
  });
  it('junk range -> Max; Max is lifetime (no lower bound)', () => {
    expect(resolveDashboardRange('999')).toBe('maximum');
    expect(resolveDashboardRange(null)).toBe('maximum');
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
