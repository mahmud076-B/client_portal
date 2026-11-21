import { computeResult, deriveDeliveryStatus, resolveResultSpec, type InsightRow } from '@/lib/meta/results';

/**
 * Performance commentary for the Live Updates feed ("Running well now",
 * "Reach is down 25% vs yesterday", ...).
 *
 * Compares the latest day (today, pace-adjusted for the hours elapsed in the
 * ad account's timezone) against the previous day and the 7-day average
 * before it. Pure and dependency-free so it can be unit-tested; the sync job
 * persists the output through campaign_events (deduped per campaign per day).
 */

export type InsightEventType = 'performance_up' | 'performance_down' | 'fatigue_warning' | 'pacing';

export interface PerformanceEvent {
  type: InsightEventType;
  severity: 'success' | 'warning' | 'info';
  /** Stable per-day key fragment, e.g. "reach_down". */
  kind: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  /** Used to keep only the most important few per campaign per day. */
  weight: number;
}

export type InsightDayRow = InsightRow & { clicks?: number | string | null };

export interface CampaignForInsights {
  id: string;
  name: string;
  objective?: string | null;
  optimization_goal?: string | null;
  status?: string | null;
  effective_status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  daily_budget?: number | string | null;
  lifetime_budget?: number | string | null;
}

export const CHANGE_THRESHOLD = 0.2;   // ±20%
export const FREQUENCY_FATIGUE = 3;    // avg impressions per person per day
export const MAX_EVENTS_PER_DAY = 3;
const MIN_IMPRESSIONS = 300;           // ignore noise on tiny days
const MIN_PACE_FRACTION = 0.25;        // need ≥ 6h of "today" before judging it

const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const pct = (a: number, b: number) => (b > 0 ? (a - b) / b : null);
const mag = (p: number) => Math.min(Math.abs(p), 0.5) * 100;
const fmtPct = (p: number) => `${Math.round(Math.abs(p) * 100)}%`;

interface DayStats { impressions: number; reach: number; clicks: number; spend: number; results: number }

function dayStats(row: InsightDayRow, results: number, scale = 1): DayStats {
  return {
    impressions: n(row.impressions) * scale,
    reach: n(row.reach) * scale,
    clicks: n(row.clicks) * scale,
    spend: n(row.spend) * scale,
    results: results * scale,
  };
}

function avg(days: DayStats[]): DayStats {
  const k = Math.max(1, days.length);
  const sum = days.reduce((s, d) => ({
    impressions: s.impressions + d.impressions, reach: s.reach + d.reach, clicks: s.clicks + d.clicks,
    spend: s.spend + d.spend, results: s.results + d.results,
  }), { impressions: 0, reach: 0, clicks: 0, spend: 0, results: 0 });
  return { impressions: sum.impressions / k, reach: sum.reach / k, clicks: sum.clicks / k, spend: sum.spend / k, results: sum.results / k };
}

/** "vs yesterday" when that comparison is strong enough, else "vs the 7-day average". */
function pickBaseline(cur: number, prev: number | null, avg7: number | null) {
  const p1 = prev !== null ? pct(cur, prev) : null;
  const p7 = avg7 !== null ? pct(cur, avg7) : null;
  if (p1 !== null && Math.abs(p1) >= CHANGE_THRESHOLD) return { change: p1, vs: 'vs yesterday' };
  if (p7 !== null && Math.abs(p7) >= CHANGE_THRESHOLD) return { change: p7, vs: 'vs the 7-day average' };
  return null;
}

interface PreparedDays {
  resultByDate: Map<string, number>;
  resultLabel: string;
  costLabel: string;
  label: 'today' | 'yesterday';
  latestRow: InsightDayRow;
  latestRaw: DayStats;
  latest: DayStats;
  prev: DayStats;
  base7: DayStats | null;
}

function prepareDays(params: {
  campaign: CampaignForInsights; rows: InsightDayRow[]; today: string; dayFraction: number;
}): PreparedDays | null {
  const { campaign, today } = params;
  const rows = [...params.rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length < 2) return null;

  const spec = resolveResultSpec(campaign.objective, campaign.optimization_goal);
  const resultByDate = new Map<string, number>();
  let resultLabel = 'results';
  let costLabel = 'Cost per result';
  if (spec && spec.metric.kind !== 'reach' && spec.metric.kind !== 'impressions') {
    const r = computeResult(spec, rows, { totalSpend: 0 });
    if (!r.pendingResync) r.daily.forEach((d) => resultByDate.set(d.date, d.value));
    const l = spec.label.split(' / ')[0];
    resultLabel = /[A-Z].*[A-Z]/.test(l) ? l : l.toLowerCase();
    costLabel = spec.costLabel;
  }

  // Latest day: today (pace-adjusted) if we have it and enough of the day elapsed, otherwise the last full day.
  let latestIdx = rows.length - 1;
  let scale = 1;
  let label: 'today' | 'yesterday' = 'today';
  if (rows[latestIdx].date === today) {
    if (params.dayFraction < MIN_PACE_FRACTION) latestIdx -= 1;
    else scale = 1 / Math.min(1, params.dayFraction);
  }
  if (latestIdx < 1) return null;
  if (rows[latestIdx].date !== today) label = 'yesterday';
  const latestRow = rows[latestIdx];
  const latestRaw = dayStats(latestRow, resultByDate.get(latestRow.date) ?? 0);
  const latest = dayStats(latestRow, resultByDate.get(latestRow.date) ?? 0, scale);
  const prevRow = rows[latestIdx - 1];
  const prev = dayStats(prevRow, resultByDate.get(prevRow.date) ?? 0);
  const window = rows.slice(Math.max(0, latestIdx - 7), latestIdx).map((r) => dayStats(r, resultByDate.get(r.date) ?? 0));
  const base7 = window.length >= 3 ? avg(window) : null;

  return { resultByDate, resultLabel, costLabel, label, latestRow, latestRaw, latest, prev, base7 };
}

/** Compact day-over-day numbers for the AI coach status line. */
export function dayOverDay(params: {
  campaign: CampaignForInsights; rows: InsightDayRow[]; today: string; dayFraction: number;
}) {
  const p = prepareDays(params);
  if (!p) return null;
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 100));
  const cpr = (d: DayStats) => (d.results > 0 ? d.spend / d.results : null);
  const ctr = (d: DayStats) => (d.impressions > 0 ? d.clicks / d.impressions : null);
  const ch = (a: number | null, b: number | null) => (a === null || b === null ? null : r1(pct(a, b)));
  const hasResults = p.resultByDate.size > 0;
  return {
    campaign: params.campaign.name,
    comparing: p.label === 'today' ? 'today so far (pace-adjusted) vs yesterday' : 'yesterday vs the day before',
    result_label: hasResults ? p.resultLabel : null,
    pct_change_vs_previous_day: {
      results: hasResults ? ch(p.latest.results, p.prev.results) : null,
      reach: ch(p.latest.reach, p.prev.reach),
      cost_per_result: hasResults ? ch(cpr(p.latest), cpr(p.prev)) : null,
      ctr: ch(ctr(p.latestRaw), ctr(p.prev)),
    },
    pct_change_vs_7day_avg: p.base7
      ? {
          results: hasResults ? ch(p.latest.results, p.base7.results) : null,
          reach: ch(p.latest.reach, p.base7.reach),
          cost_per_result: hasResults ? ch(cpr(p.latest), cpr(p.base7)) : null,
        }
      : null,
    frequency_today: p.latestRaw.reach > 0 ? Math.round((p.latestRaw.impressions / p.latestRaw.reach) * 10) / 10 : null,
  };
}

export function buildPerformanceInsights(params: {
  campaign: CampaignForInsights;
  /** Daily campaign_insights rows (any order); last ~9 days is enough. */
  rows: InsightDayRow[];
  /** YYYY-MM-DD "today" in the ad account timezone. */
  today: string;
  /** Fraction of "today" elapsed in the ad account timezone (0..1). */
  dayFraction: number;
  currency?: string | null;
  now?: Date;
}): PerformanceEvent[] {
  const { campaign, currency } = params;
  const now = params.now ?? new Date();
  if (!deriveDeliveryStatus(campaign, now).isLive) return [];

  const prep = prepareDays(params);
  if (!prep) return [];
  const { resultByDate, resultLabel, costLabel, label, latestRow, latestRaw, latest, prev, base7 } = prep;
  if (latestRaw.impressions < MIN_IMPRESSIONS / 2 || (prev.impressions < MIN_IMPRESSIONS && !base7)) return [];

  const name = campaign.name;
  const when = label === 'today' ? 'now' : 'yesterday';
  const vsY = label === 'today' ? 'vs yesterday' : 'vs the day before';
  const fixVs = (vs: string) => (vs === 'vs yesterday' ? vsY : vs);
  const money = (v: number) => `${currency ? `${currency} ` : '$'}${v.toFixed(2)}`;
  const out: PerformanceEvent[] = [];

  // 1. Results pace (headline: "running well" / "slowing down")
  const hasResults = resultByDate.size > 0 && (prev.results > 0 || (base7?.results ?? 0) > 0);
  let resultsChange: number | null = null;
  if (hasResults) {
    const b = pickBaseline(latest.results, prev.results, base7?.results ?? null);
    if (b) {
      resultsChange = b.change;
      const up = b.change > 0;
      out.push({
        type: up ? 'performance_up' : 'performance_down',
        severity: up ? 'success' : 'warning',
        kind: up ? 'results_up' : 'results_down',
        title: up
          ? `${name} is running well ${when}: ${resultLabel} up ${fmtPct(b.change)} ${fixVs(b.vs)}`
          : `${name} is slowing down ${when}: ${resultLabel} down ${fmtPct(b.change)} ${fixVs(b.vs)}`,
        body: label === 'today' ? `${Math.round(latestRaw.results)} ${resultLabel} so far today.` : `${Math.round(latestRaw.results)} ${resultLabel} yesterday.`,
        metadata: { metric: 'results', change: b.change, vs: b.vs, latest: latest.results, previous: prev.results, avg7: base7?.results ?? null, day: latestRow.date },
        weight: 100 + mag(b.change),
      });
    }
  }

  // 2. Cost per result (lower is better)
  if (hasResults && latest.results > 0) {
    const cpr = latest.spend / latest.results;
    const cprPrev = prev.results > 0 ? prev.spend / prev.results : null;
    const cpr7 = base7 && base7.results > 0 ? base7.spend / base7.results : null;
    const b = pickBaseline(cpr, cprPrev, cpr7);
    if (b) {
      const cheaper = b.change < 0;
      const per = costLabel.replace(/^Cost per /i, '');
      out.push({
        type: cheaper ? 'performance_up' : 'performance_down',
        severity: cheaper ? 'success' : 'warning',
        kind: cheaper ? 'cpr_down' : 'cpr_up',
        title: cheaper
          ? `${costLabel} is down ${fmtPct(b.change)} ${fixVs(b.vs)} on ${name}`
          : `${costLabel} is up ${fmtPct(b.change)} ${fixVs(b.vs)} on ${name}`,
        body: `Now ${money(cpr)} per ${per}.`,
        metadata: { metric: 'cost_per_result', change: b.change, vs: b.vs, latest: cpr, previous: cprPrev, avg7: cpr7, day: latestRow.date },
        weight: 90 + mag(b.change),
      });
    }
  }

  // 3. Reach (fallback to impressions when reach is missing)
  const useReach = latest.reach > 0 && (prev.reach > 0 || (base7?.reach ?? 0) > 0);
  const vol = useReach ? 'reach' : 'impressions';
  {
    const b = pickBaseline(latest[vol], prev[vol], base7 ? base7[vol] : null);
    if (b) {
      const up = b.change > 0;
      const Word = useReach ? 'Reach' : 'Impressions';
      out.push({
        type: up ? 'performance_up' : 'performance_down',
        // Fewer people reached is only worth a warning if results did not improve.
        severity: up ? 'success' : resultsChange !== null && resultsChange > 0 ? 'info' : 'warning',
        kind: up ? `${vol}_up` : `${vol}_down`,
        title: `${Word} is ${up ? 'up' : 'down'} ${fmtPct(b.change)} ${fixVs(b.vs)} on ${name}`,
        body: up ? 'More people are seeing your ads.' : 'Fewer people are seeing your ads right now.',
        metadata: { metric: vol, change: b.change, vs: b.vs, latest: latest[vol], previous: prev[vol], avg7: base7 ? base7[vol] : null, day: latestRow.date },
        weight: 70 + mag(b.change),
      });
    }
  }

  // 4. CTR (ratio: not pace-adjusted)
  if (latestRaw.impressions >= MIN_IMPRESSIONS) {
    const ctr = latestRaw.clicks / latestRaw.impressions;
    const ctrPrev = prev.impressions > 0 ? prev.clicks / prev.impressions : null;
    const ctr7 = base7 && base7.impressions > 0 ? base7.clicks / base7.impressions : null;
    const b = pickBaseline(ctr, ctrPrev, ctr7);
    if (b) {
      const up = b.change > 0;
      out.push({
        type: up ? 'performance_up' : 'performance_down',
        severity: up ? 'success' : 'info',
        kind: up ? 'ctr_up' : 'ctr_down',
        title: `Click-through rate is ${up ? 'up' : 'down'} ${fmtPct(b.change)} ${fixVs(b.vs)} on ${name}`,
        body: `CTR is ${(ctr * 100).toFixed(2)}%.`,
        metadata: { metric: 'ctr', change: b.change, vs: b.vs, latest: ctr, previous: ctrPrev, avg7: ctr7, day: latestRow.date },
        weight: 50 + mag(b.change),
      });
    }
  }

  // 5. Ad fatigue (daily frequency = impressions / reach)
  if (latestRaw.reach > 0) {
    const freq = latestRaw.impressions / latestRaw.reach;
    if (freq > FREQUENCY_FATIGUE) {
      out.push({
        type: 'fatigue_warning',
        severity: 'warning',
        kind: 'fatigue',
        title: `People are seeing ${name} ads often (${freq.toFixed(1)}x)`,
        body: 'High frequency can cause ad fatigue. Fresh creative may help.',
        metadata: { metric: 'frequency', latest: freq, threshold: FREQUENCY_FATIGUE, day: latestRow.date },
        weight: 140,
      });
    }
  }

  // 6. Spend pacing vs the daily budget
  const daily = n(campaign.daily_budget);
  if (daily > 0 && label === 'today') {
    const projected = latest.spend; // pace-adjusted to a full day
    const ratio = projected / daily;
    if (ratio < 0.6 || ratio > 1.15) {
      const under = ratio < 0.6;
      out.push({
        type: 'pacing',
        severity: under ? 'info' : 'warning',
        kind: under ? 'pacing_under' : 'pacing_over',
        title: under
          ? `${name} is spending slower than usual today`
          : `${name} is spending faster than its daily budget`,
        body: `On pace for ${money(projected)} of a ${money(daily)} daily budget.`,
        metadata: { metric: 'spend_pacing', projected, daily_budget: daily, ratio, day: latestRow.date },
        weight: under ? 40 : 80,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, MAX_EVENTS_PER_DAY);
}

/** YYYY-MM-DD and fraction of the day elapsed in a timezone. */
export function localDay(timeZone: string, now = new Date()): { today: string; dayFraction: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const dayFraction = (Number(get('hour')) * 60 + Number(get('minute'))) / 1440;
  return { today, dayFraction };
}

type DayOverDay = NonNullable<ReturnType<typeof dayOverDay>>;

/**
 * Deterministic coach-style status line (used when OpenAI is not configured
 * or fails), e.g. "Campaign is doing well: results up 18%, but reach down 25% vs yesterday".
 */
export function coachLine(items: DayOverDay[]): string | null {
  const scored = items
    .map((d) => {
      const c = d.pct_change_vs_previous_day;
      const good: string[] = [];
      const bad: string[] = [];
      const add = (v: number | null, label: string, higherIsBetter = true) => {
        if (v === null || Math.abs(v) < 10) return;
        const txt = `${label} ${v > 0 ? 'up' : 'down'} ${Math.abs(v)}%`;
        ((v > 0) === higherIsBetter ? good : bad).push(txt);
      };
      add(c.results, d.result_label ?? 'results');
      add(c.cost_per_result, 'cost per result', false);
      add(c.reach, 'reach');
      add(c.ctr, 'CTR');
      return { d, good, bad, score: good.length - bad.length + ((c.results ?? 0) > 0 ? 1 : (c.results ?? 0) < 0 ? -1 : 0) };
    })
    .filter((x) => x.good.length + x.bad.length > 0);
  if (scored.length === 0) return null;
  const top = scored.sort((a, b) => b.good.length + b.bad.length - (a.good.length + a.bad.length))[0];
  const vs = top.d.comparing.startsWith('today') ? 'vs yesterday' : 'vs the day before';
  const who = items.length > 1 ? top.d.campaign : 'Campaign';
  const mood = top.score > 0 ? 'is doing well' : top.score < 0 ? 'needs attention' : 'is steady';
  const parts = [...top.good.slice(0, 2), ...top.bad.slice(0, 2)];
  const goodTxt = top.good.slice(0, 2).join(', ');
  const badTxt = top.bad.slice(0, 2).join(', ');
  const body = goodTxt && badTxt ? `${goodTxt}, but ${badTxt}` : parts.join(', ');
  return `${who} ${mood}: ${body} ${vs}.`;
}
