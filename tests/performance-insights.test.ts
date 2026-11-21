import { describe, expect, it } from 'vitest';
import { buildPerformanceInsights } from '@/lib/events/performance-insights';

const campaign = {
  id: 'v', name: 'Velora Glow Ad (21$)', objective: 'OUTCOME_ENGAGEMENT', optimization_goal: null,
  status: 'ACTIVE', effective_status: 'ACTIVE', start_time: '2026-11-15T15:34:50Z', end_time: '2026-11-25T16:00:00Z',
};
const msg = (n: number) => [
  { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(n) },
  { action_type: 'post_engagement', value: String(n * 10) },
];
const row = (date: string, m: number, extra: Record<string, number> = {}) => ({
  date, impressions: 7500, reach: 6400, clicks: 900, spend: 2.5, messaging_conversations_started: m, actions: msg(m), ...extra,
});
const now = new Date('2026-11-21T20:00:00Z'); // 22 Nov 02:00 in Dhaka

describe('performance commentary', () => {
  it('judges the last completed day against the calendar day before, with dates and the right result type', () => {
    const rows = [row('2026-11-20', 40), row('2026-11-21', 60), row('2026-11-22', 3, { impressions: 443, reach: 400, spend: 0.09 })];
    const out = buildPerformanceInsights({ campaign, rows, today: '2026-11-22', dayFraction: 0.08, currency: 'USD', now });
    const results = out.find((e) => e.kind === 'results_up')!;
    expect(results.title).toBe('Velora Glow Ad (21$) is running well on 21 Nov: messaging conversations up 50% vs the day before');
    expect(results.body).toBe('60 messaging conversations on 21 Nov (40 the day before).');
    expect(results.metadata.day).toBe('2026-11-21');
    expect(out.map((e) => e.title).join(' ')).not.toMatch(/engagement/i);
  });

  it('never uses a missing day (sync gap) as "the day before"', () => {
    // 15-19 Nov missing: 21 Nov must not be compared with 14 Nov.
    const rows = [row('2026-11-14', 10), row('2026-11-21', 60)];
    expect(buildPerformanceInsights({ campaign, rows, today: '2026-11-22', dayFraction: 0.5, currency: 'USD', now })).toEqual([]);
  });

  it('partial today numbers never flip the verdict within a day', () => {
    const base = [row('2026-11-20', 40), row('2026-11-21', 60)];
    const early = buildPerformanceInsights({ campaign, rows: [...base, row('2026-11-22', 1)], today: '2026-11-22', dayFraction: 0.1, currency: 'USD', now });
    const late = buildPerformanceInsights({ campaign, rows: [...base, row('2026-11-22', 90)], today: '2026-11-22', dayFraction: 0.9, currency: 'USD', now });
    expect(early.map((e) => e.title)).toEqual(late.map((e) => e.title));
  });

  it('CTR commentary uses LINK clicks (Ads Manager "CTR (link)"), never clicks (all)', () => {
    // Clicks (all) 1,060 / 7,500 = 14.13% vs 859 / 7,500 = 11.45% was the old, wrong headline.
    const rows = [
      row('2026-11-20', 50, { clicks: 859, inline_link_clicks: 140 }),
      row('2026-11-21', 50, { clicks: 1060, inline_link_clicks: 143 }),
    ];
    const out = buildPerformanceInsights({ campaign, rows, today: '2026-11-22', dayFraction: 0.5, currency: 'USD', now });
    const text = out.map((e) => `${e.title} ${e.body}`).join(' ');
    expect(text).not.toMatch(/14\.13%|11\.45%/);
    expect(out.find((e) => e.kind === 'ctr_up')).toBeUndefined(); // 1.87% -> 1.91% is not news
    const shift = buildPerformanceInsights({
      campaign, today: '2026-11-22', dayFraction: 0.5, currency: 'USD', now,
      rows: [row('2026-11-20', 50, { inline_link_clicks: 100 }), row('2026-11-21', 50, { inline_link_clicks: 150 })],
    }).find((e) => e.kind === 'ctr_up')!;
    expect(shift.body).toBe('CTR (link) 2.00% on 21 Nov (1.33% the day before).');
  });
});
