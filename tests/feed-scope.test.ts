import { describe, expect, it } from 'vitest';
import { feedScopeKey, feedScopeQuery, filterToScope, MAX_SCOPE_CAMPAIGNS, parseFeedScope } from '@/lib/events/feed-scope';

const VELORA = '77d6c0f0-166c-4527-9d21-524f2a7dc1cf';
const JOSS = '11111111-2222-4333-8444-555555555555';
const qs = (s: string) => new URLSearchParams(s);

describe('Live Updates scope (bug: Velora updates shown on every campaign)', () => {
  it('single campaign', () => {
    expect(parseFeedScope(qs(`campaignId=${VELORA}`))).toEqual({ campaignIds: [VELORA] });
  });
  it('dashboard campaigns list, deduped and validated', () => {
    expect(parseFeedScope(qs(`campaignIds=${VELORA},${JOSS},${VELORA},not-a-uuid,' or 1=1`))).toEqual({ campaignIds: [VELORA, JOSS] });
  });
  it('explicit empty scope means nothing, not everything', () => {
    expect(parseFeedScope(qs('campaignIds='))).toEqual({ campaignIds: [] });
    expect(parseFeedScope(qs(''))).toEqual({});
    expect(parseFeedScope(qs('campaignIds=garbage'))).toEqual({ campaignIds: [] });
  });
  it('caps the number of campaigns', () => {
    const many = Array.from({ length: 80 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(parseFeedScope(qs(`campaignIds=${many.join(',')}`)).campaignIds).toHaveLength(MAX_SCOPE_CAMPAIGNS);
  });
  it('post-filter drops events of other campaigns (defence in depth over RLS)', () => {
    const events = [{ campaign_id: VELORA, t: 'a' }, { campaign_id: JOSS, t: 'b' }];
    expect(filterToScope(events, { campaignIds: [JOSS] })).toEqual([{ campaign_id: JOSS, t: 'b' }]);
    expect(filterToScope(events, { campaignIds: [] })).toEqual([]);
    expect(filterToScope(events, {})).toEqual(events);
  });
  it('query string round-trips and the AI coach cache key differs per scope', () => {
    expect(parseFeedScope(qs(feedScopeQuery([JOSS]).slice(1)))).toEqual({ campaignIds: [JOSS] });
    expect(feedScopeKey({ campaignIds: [VELORA] })).not.toBe(feedScopeKey({ campaignIds: [JOSS] }));
    expect(feedScopeKey({ campaignIds: [JOSS, VELORA] })).toBe(feedScopeKey({ campaignIds: [VELORA, JOSS] }));
  });
});
