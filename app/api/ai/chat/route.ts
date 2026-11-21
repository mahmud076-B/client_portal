import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/supabase/auth';
import { getOpenAIConfig } from '@/lib/ai/config';
import { checkRateLimit } from '@/lib/ai/rate-limit';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { getCampaignMetrics, getRecentEvents, isAdmin, listCampaigns, listClients, type Scope } from '@/lib/ai/campaign-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MESSAGES = 20;
const MAX_CHARS = 2000;

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function POST(req: Request) {
  const config = getOpenAIConfig();
  if (!config) {
    return jsonError(503, 'The AI assistant is not configured yet. Please ask the Marketivity team to add OPENAI_API_KEY.', {
      code: 'AI_NOT_CONFIGURED',
    });
  }

  const { user, profile, client } = await getCurrentProfile();
  if (!user || !profile) return jsonError(401, 'Please sign in again.');

  const limit = checkRateLimit(`chat:${user.id}`);
  if (!limit.ok) {
    return jsonError(429, `You're sending messages too quickly. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`, {
      code: 'RATE_LIMITED',
      retryAfterSec: limit.retryAfterSec,
    });
  }

  let body: { messages?: UIMessage[]; campaignId?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid request.');
  }
  const messages = (body.messages || []).slice(-MAX_MESSAGES);
  if (messages.length === 0) return jsonError(400, 'No message.');
  const lastText = messages
    .at(-1)
    ?.parts?.map((p) => (p.type === 'text' ? p.text : ''))
    .join('') ?? '';
  if (lastText.length > MAX_CHARS) return jsonError(400, `Please keep questions under ${MAX_CHARS} characters.`);

  const scope: Scope = { supabase: await createClient(), profile };
  const admin = isAdmin(profile);
  // Ignored for client users (RLS already scopes them); lets admins filter by client.
  const clientIdField = {
    client_id: z.string().uuid().optional().describe(admin ? 'Optional: restrict to one client (id from list_clients).' : 'Not used.'),
  };

  const tools = {
    list_campaigns: tool({
      description: 'List the campaigns this user can see, with objective, status, budget, currency and dates.',
      inputSchema: z.object({ ...clientIdField }),
      execute: async (input) => listCampaigns(scope, { clientId: input.client_id }),
    }),
    get_campaign_metrics: tool({
      description:
        'Get totals (spend, impressions, clicks, reach, results such as messages) and derived costs for ONE campaign over a date range. Omit dates for lifetime totals.',
      inputSchema: z.object({
        campaign_id: z.string().uuid(),
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date YYYY-MM-DD (inclusive).'),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date YYYY-MM-DD (inclusive).'),
        include_daily: z.boolean().optional().describe('Include up to 31 daily rows, only when trends per day are needed.'),
      }),
      execute: async (input) =>
        getCampaignMetrics(scope, {
          campaignId: input.campaign_id,
          since: input.since,
          until: input.until,
          includeDaily: input.include_daily,
        }),
    }),
    get_recent_updates: tool({
      description: 'Recent automatic campaign updates: status changes, completions, new results, spend/budget milestones.',
      inputSchema: z.object({
        campaign_id: z.string().uuid().optional(),
        since_hours: z.number().int().min(1).max(24 * 31).optional(),
        ...clientIdField,
      }),
      execute: async (input) =>
        getRecentEvents(scope, {
          campaignId: input.campaign_id,
          sinceHours: input.since_hours,
          clientId: input.client_id,
          limit: 25,
        }),
    }),
    ...(admin
      ? {
          list_clients: tool({
            description: 'Admin only: list clients in the organization (id, name).',
            inputSchema: z.object({}),
            execute: async () => listClients(scope),
          }),
        }
      : {}),
  };

  const openai = createOpenAI({ apiKey: config.apiKey });

  try {
    const result = streamText({
      model: openai(config.model),
      instructions: buildSystemPrompt({ profile, client, focusCampaignId: body.campaignId ?? null }),
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: isStepCount(6),
      maxOutputTokens: 1200,
      // parallelToolCalls: false — the model otherwise emits a pseudo-tool 'parallel' (AI_NoSuchToolError in prod logs).
      providerOptions: { openai: { reasoningEffort: 'low', store: false, parallelToolCalls: false } },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: (err: unknown) => {
          console.error('[AI Chat] stream error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          if (/api key|401|incorrect api key/i.test(msg)) return 'The AI service key is invalid. Please contact the Marketivity team.';
          if (/quota|billing|429/i.test(msg)) return 'The AI service is busy or out of credit right now. Please try again later.';
          return 'Sorry, something went wrong while answering. Please try again.';
        },
      }),
    });
  } catch (err) {
    console.error('[AI Chat] failed:', err);
    return jsonError(500, 'Sorry, something went wrong. Please try again.');
  }
}
