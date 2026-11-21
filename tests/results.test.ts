import { describe, expect, it } from 'vitest';
import { computeResult, objectiveLabel, resolveResultSpec, resolveResultSpecForData } from '@/lib/meta/results';

const act = (pairs: Record<string, number>) => Object.entries(pairs).map(([action_type, value]) => ({ action_type, value: String(value) }));

describe('result type mapping (Ads Manager "Results" column)', () => {
  it.each([
    ['OUTCOME_ENGAGEMENT', 'CONVERSATIONS', 'messaging', 'Cost per conversation'],
    ['OUTCOME_SALES', 'CONVERSATIONS', 'messaging', 'Cost per conversation'],
    ['MESSAGES', null, 'messaging', 'Cost per conversation'],
    ['OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'post_engagement', 'Cost per engagement'],
    ['OUTCOME_ENGAGEMENT', null, 'post_engagement', 'Cost per engagement'],
    ['OUTCOME_ENGAGEMENT', 'PAGE_LIKES', 'follows', 'Cost per follow'],
    ['PAGE_LIKES', null, 'follows', 'Cost per follow'],
    ['OUTCOME_TRAFFIC', 'LINK_CLICKS', 'link_clicks', 'Cost per link click'],
    ['OUTCOME_TRAFFIC', 'LANDING_PAGE_VIEWS', 'landing_page_views', 'Cost per landing page view'],
    ['OUTCOME_LEADS', 'LEAD_GENERATION', 'leads', 'Cost per lead'],
    ['OUTCOME_LEADS', 'OFFSITE_CONVERSIONS', 'leads', 'Cost per lead'],
    ['OUTCOME_SALES', 'OFFSITE_CONVERSIONS', 'purchases', 'Cost per purchase'],
    ['OUTCOME_SALES', null, 'purchases', 'Cost per purchase'],
    ['OUTCOME_ENGAGEMENT', 'THRUPLAY', 'thruplay', 'Cost per ThruPlay'],
    ['OUTCOME_AWARENESS', 'REACH', 'reach', 'Cost per 1,000 reached'],
  ])('%s + %s -> %s', (objective, goal, key, costLabel) => {
    const spec = resolveResultSpec(objective, goal);
    expect(spec?.key).toBe(key);
    expect(spec?.costLabel).toBe(costLabel);
  });

  it('optimization goal wins over the objective label', () => {
    expect(objectiveLabel('OUTCOME_ENGAGEMENT', 'CONVERSATIONS')).toBe('Messages');
    expect(objectiveLabel('OUTCOME_ENGAGEMENT', 'PAGE_LIKES')).toBe('Followers');
    expect(objectiveLabel('OUTCOME_ENGAGEMENT', null)).toBe('Engagement');
  });

  it('unknown goal + messaging conversations in the data -> Messaging (the Velora Glow bug)', () => {
    const rows = [{ actions: act({ post_engagement: 1724, 'onsite_conversion.messaging_conversation_started_7d': 600, link_click: 994 }) }];
    expect(resolveResultSpecForData('OUTCOME_ENGAGEMENT', null, rows)?.key).toBe('messaging');
  });

  it('legacy rows (dedicated messaging column only) are recognised too', () => {
    expect(resolveResultSpecForData('OUTCOME_ENGAGEMENT', null, [{ messaging_conversations_started: 4 }])?.key).toBe('messaging');
  });

  it('a known goal is never overridden by the data', () => {
    const rows = [{ actions: act({ 'onsite_conversion.messaging_conversation_started_7d': 9, like: 30 }) }];
    expect(resolveResultSpecForData('OUTCOME_ENGAGEMENT', 'PAGE_LIKES', rows)?.key).toBe('follows');
  });

  it('engagement campaign without messaging stays Post engagements', () => {
    expect(resolveResultSpecForData('OUTCOME_ENGAGEMENT', null, [{ actions: act({ post_engagement: 50 }) }])?.key).toBe('post_engagement');
  });
});

describe('computeResult', () => {
  it('messages: 600 conversations for $18.47 -> ~$0.03 each (Ads Manager ground truth)', () => {
    const spec = resolveResultSpec('OUTCOME_ENGAGEMENT', 'CONVERSATIONS')!;
    const r = computeResult(spec, [{ date: '2026-11-22', actions: act({ 'onsite_conversion.messaging_conversation_started_7d': 600, post_engagement: 1724 }) }], { totalSpend: 18.47 });
    expect(r.total).toBe(600);
    expect(r.costPerResult).toBeCloseTo(0.0308, 4);
  });

  it('followers: Page likes action counted, never summed with overlapping follow types', () => {
    const spec = resolveResultSpec('OUTCOME_ENGAGEMENT', 'PAGE_LIKES')!;
    const r = computeResult(spec, [
      { date: '2026-11-20', actions: act({ like: 10, 'onsite_conversion.page_follow': 10 }) },
      { date: '2026-11-21', actions: act({ like: 5 }) },
    ], { totalSpend: 3 });
    expect(r.total).toBe(15);
    expect(r.costPerResult).toBeCloseTo(0.2);
  });

  it('leads and purchases (with ROAS)', () => {
    const leads = computeResult(resolveResultSpec('OUTCOME_LEADS', 'LEAD_GENERATION')!, [{ date: 'd', actions: act({ lead: 8 }) }], { totalSpend: 16 });
    expect(leads.total).toBe(8);
    expect(leads.costPerResult).toBe(2);
    const sales = computeResult(
      resolveResultSpec('OUTCOME_SALES', 'OFFSITE_CONVERSIONS')!,
      [{ date: 'd', actions: act({ omni_purchase: 4 }), action_values: act({ omni_purchase: 200 }) }],
      { totalSpend: 50 }
    );
    expect(sales.total).toBe(4);
    expect(sales.roas).toBe(4);
  });

  it('traffic: link clicks', () => {
    const r = computeResult(resolveResultSpec('OUTCOME_TRAFFIC', 'LINK_CLICKS')!, [{ date: 'd', actions: act({ link_click: 994 }) }], { totalSpend: 18.47 });
    expect(r.total).toBe(994);
  });

  it('zero results -> no cost per result (no division by zero)', () => {
    const r = computeResult(resolveResultSpec('MESSAGES')!, [{ date: 'd', actions: [] }], { totalSpend: 5 });
    expect(r.total).toBe(0);
    expect(r.costPerResult).toBeNull();
  });
});
