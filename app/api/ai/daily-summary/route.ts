import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/supabase/auth';
import { getOpenAIConfig } from '@/lib/ai/config';
import { checkRateLimit } from '@/lib/ai/rate-limit';
import { getRecentEvents, listCampaigns, type Scope } from '@/lib/ai/campaign-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Per-instance cache: one summary per user per 3h keeps cost negligible.
const cache = new Map<string, { at: number; summary: string | null }>();
const TTL_MS = 3 * 60 * 60 * 1000;

export async function GET() {
  const config = getOpenAIConfig();
  if (!config) return Response.json({ summary: null, configured: false });

  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json({ summary: hit.summary, configured: true, cached: true });

  if (!checkRateLimit(`summary:${user.id}`, [{ limit: 6, windowMs: 24 * 3600_000 }]).ok) {
    return Response.json({ summary: hit?.summary ?? null, configured: true });
  }

  const scope: Scope = { supabase: await createClient(), profile };
  const [{ events = [] }, campaigns] = await Promise.all([
    getRecentEvents(scope, { sinceHours: 24, limit: 40 }),
    listCampaigns(scope),
  ]);

  if (events.length === 0) {
    cache.set(user.id, { at: Date.now(), summary: null });
    return Response.json({ summary: null, configured: true });
  }

  try {
    const openai = createOpenAI({ apiKey: config.apiKey });
    const { text } = await generateText({
      model: openai(config.model),
      instructions:
        'Write ONE short, friendly sentence (max 25 words) summarising the last 24 hours of ad campaign updates for a client. ' +
        'Use only the facts given. No greetings, no emojis, no advice. English.',
      prompt: JSON.stringify({
        campaigns: 'campaigns' in campaigns ? campaigns.campaigns?.map((c) => ({ name: c.name, status: c.status })) : [],
        updates_last_24h: events.map((e) => ({ title: e.title, body: e.body, at: e.occurred_at })),
      }),
      maxOutputTokens: 300,
      providerOptions: { openai: { reasoningEffort: 'low', store: false } },
    });
    const summary = text.trim() || null;
    cache.set(user.id, { at: Date.now(), summary });
    return Response.json({ summary, configured: true });
  } catch (err) {
    console.error('[AI Summary] failed:', err);
    return Response.json({ summary: null, configured: true });
  }
}
