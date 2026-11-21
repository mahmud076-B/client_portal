import { describe, expect, it } from 'vitest';
import { deriveDeliveryStatus, summarizeDeliveryStatus } from '@/lib/meta/results';

const NOW = new Date('2026-11-22T00:00:00+06:00');

describe('deriveDeliveryStatus (single source of truth)', () => {
  it('ACTIVE inside its schedule -> Active (live)', () => {
    const s = deriveDeliveryStatus({ effective_status: 'ACTIVE', start_time: '2026-11-15T00:00:00+0600', end_time: '2026-11-25T23:59:00+0600' }, NOW);
    expect(s.code).toBe('ACTIVE');
    expect(s.isLive).toBe(true);
  });
  it('ACTIVE after its end date -> Completed (Meta keeps ACTIVE)', () => {
    const s = deriveDeliveryStatus({ effective_status: 'ACTIVE', end_time: '2026-11-10T00:00:00+0600' }, NOW);
    expect(s.code).toBe('COMPLETED');
    expect(s.isLive).toBe(false);
  });
  it('ACTIVE before start -> Scheduled', () => {
    expect(deriveDeliveryStatus({ effective_status: 'ACTIVE', start_time: '2026-12-01T00:00:00Z' }, NOW).code).toBe('SCHEDULED');
  });
  it('paused stays Paused even after end date', () => {
    expect(deriveDeliveryStatus({ effective_status: 'PAUSED', end_time: '2026-11-10T00:00:00Z' }, NOW).code).toBe('PAUSED');
  });
  it.each([
    ['DISAPPROVED', 'REJECTED'], ['WITH_ISSUES', 'REJECTED'], ['ARCHIVED', 'ARCHIVED'], ['DELETED', 'DELETED'],
    ['PENDING_REVIEW', 'IN_REVIEW'], ['IN_PROCESS', 'IN_REVIEW'], ['CAMPAIGN_PAUSED', 'PAUSED'], ['ADSET_PAUSED', 'PAUSED'],
  ])('%s -> %s', (eff, code) => {
    expect(deriveDeliveryStatus({ effective_status: eff }, NOW).code).toBe(code);
  });
  it('falls back to status when effective_status is missing', () => {
    expect(deriveDeliveryStatus({ status: 'ACTIVE' }, NOW).code).toBe('ACTIVE');
  });
});

describe('summarizeDeliveryStatus (client row in admin list)', () => {
  it('no campaigns -> null', () => expect(summarizeDeliveryStatus([], NOW)).toBeNull());
  it('one finished campaign -> Completed, not Active', () => {
    const s = summarizeDeliveryStatus([{ effective_status: 'ACTIVE', end_time: '2026-11-01T00:00:00Z' }], NOW)!;
    expect(s.code).toBe('COMPLETED');
    expect(s.isLive).toBe(false);
  });
  it('any live campaign -> Active, counting live ones', () => {
    const s = summarizeDeliveryStatus([
      { effective_status: 'ACTIVE', end_time: '2026-11-01T00:00:00Z' },
      { effective_status: 'ACTIVE' },
      { effective_status: 'ACTIVE', end_time: '2026-12-30T00:00:00Z' },
    ], NOW)!;
    expect(s.code).toBe('ACTIVE');
    expect(s.liveCount).toBe(2);
    expect(s.label).toBe('2 active');
  });
  it('paused beats completed when nothing is live', () => {
    expect(summarizeDeliveryStatus([{ effective_status: 'PAUSED' }, { effective_status: 'ACTIVE', end_time: '2026-11-01T00:00:00Z' }], NOW)!.code).toBe('PAUSED');
  });
});
