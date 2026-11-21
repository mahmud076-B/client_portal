import { describe, expect, it } from 'vitest';
import { linkMetrics, rowLinkClicks, sumLinkClicks } from '@/lib/campaigns/metrics';
import { planHistoricalRange } from '@/lib/meta/insight-gap';
import { attributeEvents, perfEventKey, type CampaignEvent } from '@/lib/events/campaign-events';

describe('null inline_link_clicks never shifts CPC/CTR', () => {
  // JOSS BD 15–21 Nov as stored at 3:35 AM: 19 Nov had inline_link_clicks NULL, link_click action 95.
  const link = (n: number) => [{ action_type: 'link_click', value: String(n) }];
  const rows = [
    { date: '2026-11-18', inline_link_clicks: 6, actions: link(6) },
    { date: '2026-11-19', inline_link_clicks: null, actions: link(95) },
    { date: '2026-11-20', inline_link_clicks: 66, actions: link(66) },
    { date: '2026-11-21', inline_link_clicks: 145, actions: link(145) },
  ];
  it('falls back to actions.link_click for the NULL day', () => {
    expect(rowLinkClicks(rows[1])).toBe(95);
    expect(sumLinkClicks(rows)).toBe(312);
    const m = linkMetrics({ spend: 6.16, impressions: 18272, clicks: 676, linkClicks: sumLinkClicks(rows) });
    expect(m.cpc_link!.toFixed(4)).toBe('0.0197');
    expect(m.ctr_link_percent!.toFixed(2)).toBe('1.71');
  });
});

describe('historical range / backfill marker', () => {
  it('a day that already had a row (19 Nov) is re-read and the marker reaches D-3, not the last gap day', () => {
    const plan = planHistoricalRange({ today: '2026-11-22', gap: { since: '2026-09-22', until: '2026-11-18' } });
    expect(plan).toEqual({ since: '2026-09-22', until: '2026-11-19', markThrough: '2026-11-19' });
  });
  it('no gap: still re-reads D-9..D-3 (late attribution) and advances the marker', () => {
    expect(planHistoricalRange({ today: '2026-11-22', gap: null })).toEqual({ since: '2026-11-13', until: '2026-11-19', markThrough: '2026-11-19' });
  });
});

describe('Live Updates dedupe', () => {
  const ev = (kind: string, title: string): CampaignEvent => ({
    campaign_id: 'v', event_type: 'performance_up', severity: 'info', title, body: '',
    metadata: { metric: 'ctr', kind, day: '2026-11-21' }, event_key: perfEventKey('v', 'ctr', '2026-11-21'), occurred_at: '2026-11-21T21:31:00Z',
  });
  it('performance keys are per metric and day, so "CTR up" and "CTR down" cannot coexist', () => {
    expect(perfEventKey('v', 'ctr', '2026-11-21')).toBe('v:perf:ctr:2026-11-21');
  });
  it('one row per client + event_key, even if a batch repeats a key; each assigned client gets its own row', () => {
    const rows = attributeEvents([ev('ctr_up', 'first'), ev('ctr_down', 'second')], 'org', new Map([['v', ['c1', 'c2', 'c1']]]));
    expect(rows.map((r) => r.dedupe_key).sort()).toEqual(['c1:v:perf:ctr:2026-11-21', 'c2:v:perf:ctr:2026-11-21']);
    expect(rows.every((r) => r.title === 'first')).toBe(true);
  });
});
