import { describe, expect, it } from 'vitest';
import {
  attributeEvents,
  campaignResult,
  diffSnapshots,
  rebaseSnapshotTotals,
  type AccountSnapshot,
  type CampaignSnapshot,
} from '@/lib/events/campaign-events';

const VELORA = '77d6c0f0-166c-4527-9d21-524f2a7dc1cf';
const JEWEL = '0b8f1d2e-1111-4c2b-9a51-000000000002';
const C_VELORA_BD = 'a14cc5d6-1dcf-4315-ba1b-9ba76a78373f';
const C_MKT_OWN = '732079b7-de43-403d-bf53-ea34e284362c';
const C_CHADER = 'b5b09c8a-a5c1-4489-8003-2c2aa13dc100';

const snap = (over: Partial<CampaignSnapshot> & { id: string }): CampaignSnapshot => ({
  name: 'Velora Glow Ad (21$)', objective: 'OUTCOME_ENGAGEMENT', effective_status: 'ACTIVE',
  derived_status: 'ACTIVE', lifetime_budget: null, end_time: null, totals: {}, result: null, days: 3, ...over,
});
const map = (...s: CampaignSnapshot[]): AccountSnapshot => new Map(s.map((x) => [x.id, x]));
const at = new Date('2026-11-21T20:00:00Z');
const msgs = (total: number) => ({ label: 'messaging conversations', total });

describe('event generation is per campaign', () => {
  it('each event carries its own campaign id and name, computed from that campaign only', () => {
    const before = map(
      snap({ id: VELORA, totals: { spend: 18.39 }, result: msgs(597) }),
      snap({ id: JEWEL, name: 'Jewellery Combo Ad (6$)', totals: { spend: 2 }, result: msgs(10) }),
    );
    const after = map(
      snap({ id: VELORA, totals: { spend: 18.47 }, result: msgs(600) }),
      snap({ id: JEWEL, name: 'Jewellery Combo Ad (6$)', derived_status: 'COMPLETED', totals: { spend: 2 }, result: msgs(10) }),
    );
    const events = diffSnapshots({ before, after, currency: 'USD', syncedAt: at });
    const v = events.filter((e) => e.campaign_id === VELORA);
    const j = events.filter((e) => e.campaign_id === JEWEL);
    expect(v.map((e) => e.event_type)).toEqual(['new_results']);
    expect(v[0].title).toBe('Velora Glow Ad (21$): +3 messaging conversations');
    expect(v[0].body).toBe('$0.08 spent since the previous sync. Total 600 messaging conversations for $18.47.');
    expect(v[0].metadata).toMatchObject({ delta: 3, from: 597, to: 600, spend_delta: 0.08 });
    expect(j.map((e) => e.event_type)).toEqual(['campaign_completed']);
    expect(j[0].title).toContain('Jewellery Combo Ad');
    for (const e of events) expect(e.event_key.startsWith(`${e.campaign_id}:`)).toBe(true);
  });

  it('only the campaign result type is announced, never a mix of every Meta action', () => {
    const before = map(snap({ id: VELORA, totals: { spend: 10, 'actions.like': 5, 'actions.lead': 1 }, result: msgs(100) }));
    const after = map(snap({ id: VELORA, totals: { spend: 11, 'actions.like': 15, 'actions.lead': 57 }, result: msgs(120) }));
    const [e] = diffSnapshots({ before, after, currency: 'USD', syncedAt: at });
    expect(e.title).toBe('Velora Glow Ad (21$): +20 messaging conversations');
    expect(e.title).not.toMatch(/likes|leads/);
  });

  it('the first sync of a campaign is history, not "new results"', () => {
    const before = map(snap({ id: VELORA, days: 0, result: null }));
    const after = map(snap({ id: VELORA, days: 3, totals: { spend: 4.74 }, result: msgs(120) }));
    expect(diffSnapshots({ before, after, currency: 'USD', syncedAt: at })).toEqual([]);
  });

  it('is deterministic: same input, same output and keys', () => {
    const before = map(snap({ id: VELORA, result: msgs(1) }));
    const after = map(snap({ id: VELORA, result: msgs(4) }));
    expect(diffSnapshots({ before, after, currency: 'USD', syncedAt: at })).toEqual(diffSnapshots({ before, after, currency: 'USD', syncedAt: at }));
  });
});

describe('status events are news, not catch-up', () => {
  // Production 2026-11-21 20:01 UTC: the first successful metadata refresh after the
  // outage turned 15 long-finished campaigns into "is now archived" / "has completed".
  it('archiving and completions that happened days ago produce no events', () => {
    const before = map(
      snap({ id: 'a', name: 'Mr Hossain Ad 3', derived_status: 'COMPLETED' }),
      snap({ id: 'b', name: 'Green Investment Ad', derived_status: 'ACTIVE', end_time: '2026-11-10T18:00:00Z' }),
    );
    const after = map(
      snap({ id: 'a', name: 'Mr Hossain Ad 3', derived_status: 'ARCHIVED' }),
      snap({ id: 'b', name: 'Green Investment Ad', derived_status: 'COMPLETED', end_time: '2026-11-10T18:00:00Z' }),
    );
    expect(diffSnapshots({ before, after, currency: 'USD', syncedAt: at })).toEqual([]);
  });
  it('a campaign that ended within 48h is announced once', () => {
    const before = map(snap({ id: VELORA, end_time: '2026-11-21T18:00:00Z' }));
    const after = map(snap({ id: VELORA, derived_status: 'COMPLETED', end_time: '2026-11-21T18:00:00Z', totals: { spend: 18.47 } }));
    const [e] = diffSnapshots({ before, after, currency: 'USD', syncedAt: at });
    expect(e).toMatchObject({ event_type: 'campaign_completed', title: 'Velora Glow Ad (21$) has completed', body: 'Final spend $18.47.', event_key: `${VELORA}:completed` });
  });
});

describe('attribution to clients', () => {
  const assignments = new Map([
    [VELORA, [C_VELORA_BD, C_MKT_OWN]],
    [JEWEL, [C_CHADER]],
  ]);
  const ev = (campaign_id: string) => ({
    campaign_id, event_type: 'new_results' as const, severity: 'success' as const, title: 't', body: null,
    metadata: {}, event_key: `${campaign_id}:results:x`, occurred_at: at.toISOString(),
  });

  it('one row per assigned client, campaign id unchanged, client-scoped dedupe key', () => {
    const rows = attributeEvents([ev(VELORA), ev(JEWEL)], 'org', assignments);
    expect(rows.map((r) => [r.campaign_id, r.client_id])).toEqual([
      [VELORA, C_VELORA_BD], [VELORA, C_MKT_OWN], [JEWEL, C_CHADER],
    ]);
    expect(rows[0].dedupe_key).toBe(`${C_VELORA_BD}:${VELORA}:results:x`);
    expect(new Set(rows.map((r) => r.dedupe_key)).size).toBe(rows.length);
  });

  it('a client never receives another campaign\'s events; unassigned campaigns produce nothing', () => {
    const rows = attributeEvents([ev(VELORA), ev('ffffffff-0000-0000-0000-000000000000')], 'org', assignments);
    expect(rows.filter((r) => r.client_id === C_CHADER)).toEqual([]);
    expect(rows.every((r) => r.campaign_id === VELORA)).toBe(true);
  });
});

describe('campaignResult', () => {
  it('Velora (engagement objective, no goal, messaging data) counts messaging conversations', () => {
    const rows = [
      { date: '2026-11-20', spend: 2.57, messaging_conversations_started: 71, actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '71' }, { action_type: 'post_engagement', value: '900' }] },
      { date: '2026-11-21', spend: 2.08, messaging_conversations_started: 46, actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '46' }, { action_type: 'post_engagement', value: '947' }] },
    ];
    expect(campaignResult({ objective: 'OUTCOME_ENGAGEMENT', optimization_goal: null }, rows)).toEqual({ label: 'messaging conversations', total: 117 });
  });
});

describe('Live Updates after a historical backfill', () => {
  it('recovered past days are not announced as new results, status changes still are', () => {
    const before = map(snap({ id: VELORA, totals: { spend: 4.7 }, result: msgs(120) }));
    const afterBackfill = map(snap({ id: VELORA, days: 8, totals: { spend: 18.39 }, result: msgs(597) }));
    const rebased = rebaseSnapshotTotals(before, afterBackfill);
    const now = map(snap({ id: VELORA, days: 8, derived_status: 'COMPLETED', totals: { spend: 18.47 }, result: msgs(600) }));
    const events = diffSnapshots({ before: rebased, after: now, currency: 'USD', syncedAt: at });
    expect(events.map((e) => e.event_type).sort()).toEqual(['campaign_completed', 'new_results']);
    expect(events.find((e) => e.event_type === 'new_results')!.title).toContain('+3 ');
  });
  it('null fresh snapshot keeps the original baseline', () => {
    const before = map(snap({ id: VELORA }));
    expect(rebaseSnapshotTotals(before, null)).toBe(before);
  });
});
