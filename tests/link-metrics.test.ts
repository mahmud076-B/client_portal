import { describe, expect, it } from 'vitest';
import { deriveRatios, linkMetrics, rowLinkClicks, sumInsights, sumLinkClicks } from '@/lib/campaigns/metrics';

// Velora Glow Ad (21$), 15–21 Nov, as synced from Meta (DB) and shown in Ads Manager:
// $18.40, 51,839 impressions, Clicks (all) 6,126, Link clicks 986 → CPC (link) $0.02, CTR (link) 1.90%.
const VELORA_7D = { spend: 18.4, impressions: 51839, clicks: 6126, linkClicks: 986 };

describe('Ads Manager CPC / CTR definitions', () => {
  it('CPC (cost per link click) and CTR (link) use link clicks; (all) uses all clicks', () => {
    const m = linkMetrics(VELORA_7D);
    expect(m.cpc_link!.toFixed(2)).toBe('0.02');
    expect(m.ctr_link_percent!.toFixed(2)).toBe('1.90');
    expect(m.ctr_all_percent!.toFixed(2)).toBe('11.82');
    expect(m.cpc_all!.toFixed(3)).toBe('0.003');
    expect(m.cpm!.toFixed(2)).toBe('0.35');
  });

  it('ratios of sums, not averages of daily ratios', () => {
    const rows = [
      { spend: 1, impressions: 100, clicks: 10, inline_link_clicks: 1, ctr: 10 },
      { spend: 9, impressions: 900, clicks: 9, inline_link_clicks: 9, ctr: 1 },
    ];
    const t = sumInsights(rows);
    const r = deriveRatios(t, sumLinkClicks(rows));
    expect(r.ctr_link_percent).toBe(1); // 10 / 1000, not mean(1%, 1%)
    expect(r.cpc_link).toBe(1); // 10 / 10
    expect(r.ctr_all_percent).toBe(1.9); // 19 / 1000, not mean(10%, 1%)
  });

  it('prefers inline_link_clicks, falls back to the link_click action, never clicks (all)', () => {
    expect(rowLinkClicks({ inline_link_clicks: 7, clicks: 50, actions: [{ action_type: 'link_click', value: '6' }] })).toBe(7);
    expect(rowLinkClicks({ inline_link_clicks: null, clicks: 50, actions: [{ action_type: 'link_click', value: '6' }] })).toBe(6);
    expect(rowLinkClicks({ clicks: 50 })).toBe(0);
  });

  it('inline_link_clicks is a delivery column, not a "result"', () => {
    const r = deriveRatios({ spend: 1, impressions: 10, clicks: 2, inline_link_clicks: 1 });
    expect(r).not.toHaveProperty('cost_per_inline_link_clicks');
  });
});
