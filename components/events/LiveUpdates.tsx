'use client';
import './live-updates.css';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { poppins } from '@/components/brand/fonts';

interface FeedEvent {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  type:
    | 'status_changed' | 'campaign_completed' | 'new_results' | 'spend_milestone' | 'budget_milestone'
    | 'performance_up' | 'performance_down' | 'fatigue_warning' | 'pacing';
  severity: 'info' | 'success' | 'warning';
  title: string;
  body: string | null;
  occurred_at: string;
}

const POLL_MS = 2 * 60 * 1000;

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function EventIcon({ type }: { type: FeedEvent['type'] }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'campaign_completed':
      return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case 'new_results':
      return <svg {...common}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>;
    case 'performance_up':
      return <svg {...common}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
    case 'performance_down':
      return <svg {...common}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
    case 'fatigue_warning':
      return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'pacing':
      return <svg {...common}><circle cx="12" cy="13" r="8" /><polyline points="12 9 12 13 14.5 15.5" /><line x1="9" y1="2" x2="15" y2="2" /></svg>;
    case 'spend_milestone':
    case 'budget_milestone':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h3.5a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4H15" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
  }
}

export default function LiveUpdates({ campaignId }: { campaignId?: string | null }) {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'campaign'>('all');
  const [live, setLive] = useState(false);
  const [polling, setPolling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const qs = scope === 'campaign' && campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
      const res = await fetch(`/api/campaign-events${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const list: FeedEvent[] = [...(data.events || [])].sort(
        (a: FeedEvent, b: FeedEvent) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)
      );
      setEvents(list);
      setPolling(true);
      setLastSyncedAt(data.lastSyncedAt ?? null);
    } catch {
      setPolling(false);
      setEvents((prev) => prev ?? []);
    }
  }, [scope, campaignId]);

  useEffect(() => {
    // Initial fetch; state is only set after the network round-trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Supabase Realtime: refetch whenever a new event the user may see is inserted (RLS applies).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('campaign-events-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_events' }, () => load())
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    fetch('/api/ai/daily-summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSummary(d?.summary ?? null))
      .catch(() => setSummary(null));
  }, []);

  return (
    <div className={`${poppins.variable} mk-lu`}>
      <div className="mk-lu-head">
        <div className="mk-lu-title">
          <span className={`mk-lu-dot ${live || polling ? 'is-live' : ''}`} aria-hidden="true" />
          Live updates
          {(live || polling) && <span className="mk-lu-livepill">LIVE</span>}
        </div>
        {campaignId && (
          <div className="mk-lu-toggle" role="tablist" aria-label="Filter updates">
            <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All</button>
            <button type="button" role="tab" aria-selected={scope === 'campaign'} className={scope === 'campaign' ? 'on' : ''} onClick={() => setScope('campaign')}>This campaign</button>
          </div>
        )}
      </div>

      <div className="mk-lu-sync">
        {lastSyncedAt ? <>Last synced {timeAgo(lastSyncedAt, now)} · updates every 30 min</> : 'Waiting for the first sync'}
      </div>

      {summary && (
        <div className="mk-lu-summary">
          <span className="mk-lu-ai">AI coach</span>
          <span>{summary}</span>
        </div>
      )}

      {events === null ? (
        <ul className="mk-lu-list" aria-busy="true">
          {[0, 1, 2].map((i) => <li key={i} className="mk-lu-skel" />)}
        </ul>
      ) : events.length === 0 ? (
        <div className="mk-lu-empty">
          No updates yet. Performance changes (reach, cost per result, CTR, pacing), new results, status changes and milestones will appear here automatically.
        </div>
      ) : (
        <ul className="mk-lu-list">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className={`mk-lu-item sev-${e.severity}${now - Date.parse(e.occurred_at) < 3600_000 ? ' is-new' : ''}`}>
              <span className="mk-lu-icon"><EventIcon type={e.type} /></span>
              <div className="mk-lu-text">
                <div className="mk-lu-item-title">{e.title}</div>
                {e.body && <div className="mk-lu-item-body">{e.body}</div>}
                <time className="mk-lu-time" dateTime={e.occurred_at} title={new Date(e.occurred_at).toLocaleString()}>
                  {timeAgo(e.occurred_at, now)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
