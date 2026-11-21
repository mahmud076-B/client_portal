import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/supabase/auth';
import { getOpenAIConfig } from '@/lib/ai/config';
import { checkRateLimit } from '@/lib/ai/rate-limit';
import { getPerformanceSnapshot, getRecentEvents, listCampaigns, type Scope } from '@/lib/ai/campaign-data';
import { coachLine } from '@/lib/events/performance-insights';
import { feedScopeKey, parseFeedScope } from '@/lib/events/feed-scope';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Per-instance cache: one summary per user per hour keeps cost negligible.
const cache = new Map<string, { at: number; summary: string | null }>();
const TTL_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const feed = parseFeedScope(new URL(req.url).searchParams);
  const cacheKey = `${user.id}:${feedScopeKey(feed)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json({ summary: hit.summary, cached: true });

  const scope: Scope = { supabase: await createClient(), profile };
  const [{ events = [] }, campaigns, performance] = await Promise.all([
    getRecentEvents(scope, { campaignIds: feed.campaignIds, sinceHours: 24, limit: 40 }),
    listCampaigns(scope, { campaignIds: feed.campaignIds }),
    getPerformanceSnapshot(scope, { campaignIds: feed.campaignIds }).catch(() => []),
  ]);

  // Deterministic coach line: always available, also the fallback if OpenAI is off or fails.
  const fallback = coachLine(performance);
  const config = getOpenAIConfig();
  if (!config || (events.length === 0 && performance.length === 0)) {
    cache.set(cacheKey, { at: Date.now(), summary: fallback });
    return Response.json({ summary: fallback, configured: Boolean(config) });
  }
  if (!checkRateLimit(`summary:${user.id}`, [{ limit: 60, windowMs: 24 * 3600_000 }]).ok) {
    return Response.json({ summary: hit?.summary ?? fallback, configured: true });
  }

  try {
    const openai = createOpenAI({ apiKey: config.apiKey });
    const { text } = await generateText({
      model: openai(config.model),
      instructions:
        'You are a friendly ad-campaign coach. Write ONE short status line (max 22 words) telling the client how their campaign is doing right now. ' +
        'Start with a verdict ("Campaign is doing well", "Campaign needs attention", "Campaign is steady"), then a colon and the 1-3 most important numbers, ' +
        'e.g. "Campaign is doing well: results up 18%, but reach down 25% vs yesterday." ' +
        'Use only the numbers given (percentages are already computed; null = unknown). Prefer day-over-day changes; mention the 7-day average only if clearer. ' +
        'If several campaigns, name the one that matters most. Simple English that is easy for Bangla speakers. No greetings, no emojis.',
      prompt: JSON.stringify({
        campaigns: 'campaigns' in campaigns ? campaigns.campaigns?.map((c) => ({ name: c.name, status: c.status })) : [],
        performance,
        updates_last_24h: events.slice(0, 20).map((e) => ({ title: e.title, body: e.body, at: e.occurred_at })),
      }),
      maxOutputTokens: 300,
      providerOptions: { openai: { reasoningEffort: 'low', store: false } },
    });
    const summary = text.trim() || fallback;
    cache.set(cacheKey, { at: Date.now(), summary });
    return Response.json({ summary, configured: true });
  } catch (err) {
    console.error('[AI Summary] failed:', err);
    return Response.json({ summary: fallback, configured: true });
  }
}
