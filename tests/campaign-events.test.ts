import { describe, expect, it } from 'vitest';
import { diffSnapshots, rebaseSnapshotTotals, type AccountSnapshot, type CampaignSnapshot } from '@/lib/events/campaign-events';

const snap = (over: Partial<CampaignSnapshot> & { id: string }): CampaignSnapshot => ({
  name: 'Velora Glow Ad (21$)', objective: 'OUTCOME_ENGAGEMENT', effective_status: 'ACTIVE',
  derived_status: 'ACTIVE', lifetime_budget: null, totals: {}, ...over,
});
const map = (...s: CampaignSnapshot[]): AccountSnapshot => new Map(s.map((x) => [x.id, x]));

describe('Live Updates after a historical backfill', () => {
  it('recovered past days are not announced as new results, status changes still are', () => {
    const before = map(snap({ id: 'v', totals: { spend: 4.7, messaging_conversations_started: 20 } }));
    const afterBackfill = map(snap({ id: 'v', totals: { spend: 18.39, messaging_conversations_started: 597 } }));
    const rebased = rebaseSnapshotTotals(before, afterBackfill);
    const now = map(snap({ id: 'v', derived_status: 'COMPLETED', totals: { spend: 18.47, messaging_conversations_started: 600 } }));
    const events = diffSnapshots({ organizationId: 'o', before: rebased, after: now, currency: 'USD', syncedAt: new Date('2026-11-22T00:00:00Z') });
    expect(events.map((e) => e.event_type).sort()).toEqual(['campaign_completed', 'new_results']);
    const results = events.find((e) => e.event_type === 'new_results')!;
    expect(results.title).toContain('+3');
  });
  it('null fresh snapshot keeps the original baseline', () => {
    const before = map(snap({ id: 'v' }));
    expect(rebaseSnapshotTotals(before, null)).toBe(before);
  });
});
