import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/supabase/auth';
import { getLastSyncedAt, getRecentEvents, type Scope } from '@/lib/ai/campaign-data';
import { filterToScope, parseFeedScope } from '@/lib/events/feed-scope';

export const dynamic = 'force-dynamic';

/** Live Updates feed for the signed-in user (RLS-scoped). */
export async function GET(req: Request) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Always scoped to the campaigns the dashboard asked for (RLS still applies on top).
  const feed = parseFeedScope(new URL(req.url).searchParams);
  const scope: Scope = { supabase: await createClient(), profile };

  const [events, lastSyncedAt] = await Promise.all([
    getRecentEvents(scope, { campaignIds: feed.campaignIds, limit: 30 }),
    getLastSyncedAt(scope, { campaignIds: feed.campaignIds }).catch(() => null),
  ]);

  return Response.json(
    {
      events: filterToScope(events.events, feed),
      unavailable: 'unavailable' in events ? Boolean(events.unavailable) : false,
      lastSyncedAt,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
