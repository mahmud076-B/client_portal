import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/supabase/auth';
import { getLastSyncedAt, getRecentEvents, type Scope } from '@/lib/ai/campaign-data';

export const dynamic = 'force-dynamic';

/** Live Updates feed for the signed-in user (RLS-scoped). */
export async function GET(req: Request) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaignId') || undefined;
  const scope: Scope = { supabase: await createClient(), profile };

  const [events, lastSyncedAt] = await Promise.all([
    getRecentEvents(scope, { campaignId, limit: 30 }),
    getLastSyncedAt(scope).catch(() => null),
  ]);

  return Response.json(
    {
      events: events.events,
      unavailable: 'unavailable' in events ? Boolean(events.unavailable) : false,
      lastSyncedAt,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
