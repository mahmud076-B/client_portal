import 'server-only';

/**
 * Basic in-memory sliding-window rate limiter, keyed per user.
 * Per serverless instance only: good enough to stop runaway usage/cost from a
 * single browser; swap for Upstash/Redis or a DB counter if abuse appears.
 */
const buckets = new Map<string, number[]>();

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export const CHAT_RATE_LIMITS: RateLimitRule[] = [
  { limit: 15, windowMs: 10 * 60 * 1000 }, // 15 messages / 10 min
  { limit: 100, windowMs: 24 * 60 * 60 * 1000 }, // 100 messages / day
];

export function checkRateLimit(
  key: string,
  rules: RateLimitRule[] = CHAT_RATE_LIMITS,
  now: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  const longest = Math.max(...rules.map((r) => r.windowMs));
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < longest);

  for (const rule of rules) {
    const inWindow = hits.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.limit) {
      const retryAfterSec = Math.ceil((inWindow[0] + rule.windowMs - now) / 1000);
      buckets.set(key, hits);
      return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
    }
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true };
}
