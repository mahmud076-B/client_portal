import { requireAuth } from '@/lib/supabase/auth';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dayIn } from '@/lib/dates';
import { after } from 'next/server';
import { getCampaignRangeTotalsCached, warmCampaignRangeTotals } from '@/lib/meta/server/period-totals';
import { deriveDeliveryStatus } from '@/lib/meta/results';
import { buildRangeAggregates, resolveDashboardRange, DEFAULT_DASHBOARD_RANGE } from '@/lib/campaigns/dashboard-totals';

export const dynamic = 'force-dynamic';

/** Server timing for the [perf] log line (not render output). */
const clock = () => performance.now();

export type { DashboardRange } from '@/lib/campaigns/dashboard-totals';

export default async function DashboardPage(
  props: { searchParams: Promise<{ campaignId?: string, days?: string, range?: string }> }
) {
  const t0 = clock();
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  // 1. Auth/profile and the client's campaigns in parallel (RLS scopes campaigns to the session's
  //    client, so the query does not need the profile first).
  const [session, { data: campaigns }] = await Promise.all([
    requireAuth().catch(() => null),
    supabase.from('campaigns').select('*'),
  ]);
  if (!session) redirect('/login');
  const { profile, client } = session;
  const tAuth = clock();

  // Range comes from the URL (in-session choice); no range = Max. Fresh visits are reset to Max
  // on the client (see shouldResetRangeOnMount): the server cannot tell an in-app navigation
  // from a full load, because Next strips the RSC router headers from headers().
  const range = resolveDashboardRange(searchParams.range ?? searchParams.days ?? null);

  if (!campaigns || campaigns.length === 0) {
    return (
      <DashboardClient 
        profile={profile} 
        client={client} 
        campaigns={[]} 
        selectedCampaign={null} 
        insights={[]}
        aggregatesByRange={null}
        today={null}
        range={DEFAULT_DASHBOARD_RANGE}
        lastSyncedAt={null}
      />
    );
  }

  // 2. Determine selected campaign
  let selectedCampaign = campaigns[0];
  if (searchParams.campaignId) {
    const found = campaigns.find(c => c.id === searchParams.campaignId);
    if (found) {
      selectedCampaign = found;
    }
  }


  // 2. Everything else in ONE parallel stage:
  //    - ad account (timezone/currency/org) -> daily rows (chart; window needs the timezone)
  //    - ad account -> Meta totals for ALL ranges in one Graph batch call, cached together, so a
  //      range switch is a cache hit and only the first view of a campaign waits on Meta
  //    - last successful sync
  const adminClient = createAdminClient();
  const adAccountP = selectedCampaign?.ad_account_id
    ? adminClient.from('ad_accounts').select('organization_id, timezone_name, currency').eq('id', selectedCampaign.ad_account_id).single().then((r) => r.data)
    : Promise.resolve(null);
  const syncLogP = selectedCampaign?.ad_account_id
    ? adminClient
        .from('sync_logs')
        .select('completed_at')
        .eq('ad_account_id', selectedCampaign.ad_account_id)
        .eq('status', 'success')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then((r) => r.data)
    : Promise.resolve(null);
  // Lifetime daily rows: every range is derived from them on the client (no round trip per range).
  const insightsP = supabase
    .from('campaign_insights')
    .select('*')
    .eq('campaign_id', selectedCampaign.id)
    .order('date', { ascending: true })
    .then((r) => r.data);
  const metaP = adAccountP.then(async (acct) => {
    const s0 = clock();
    const all = selectedCampaign?.meta_campaign_id && acct?.organization_id
      ? await getCampaignRangeTotalsCached(acct.organization_id, selectedCampaign.meta_campaign_id)
      : null;
    return { all, ms: clock() - s0 };
  });
  const [adAccount, syncLog, insightsData, meta] = await Promise.all([adAccountP, syncLogP, insightsP, metaP]);
  const allRanges = meta.all;
  const tMeta = Math.round(meta.ms);
  const tData = clock();

  const timezoneName: string = adAccount?.timezone_name || 'UTC';
  const organizationId: string | null = adAccount?.organization_id ?? null;
  const currency: string | null = adAccount?.currency ?? null;
  const lastSyncedAt: string | null = syncLog?.completed_at ?? null;
  // Ads Manager reports in the ad account timezone.
  const today = dayIn(timezoneName);

  // Warm the other campaigns the client can switch to (live ones), after the response is sent.
  if (organizationId) {
    const others = campaigns
      .filter((c) => c.id !== selectedCampaign.id && c.meta_campaign_id && c.ad_account_id === selectedCampaign.ad_account_id && deriveDeliveryStatus(c).isLive)
      .slice(0, 8)
      .map((c) => c.meta_campaign_id as string);
    if (others.length) after(() => warmCampaignRangeTotals(organizationId, others));
  }

  console.info(
    `[perf] /dashboard range=${range} auth+campaigns=${Math.round(tAuth - t0)}ms data=${Math.round(tData - tAuth)}ms meta=${tMeta}ms(${tMeta < 250 ? 'cache' : 'live'}) total=${Math.round(tData - t0)}ms`
  );

  // 6. Totals for ALL ranges (shared, unit-tested logic); the client switches range locally.
  const { byRange, messagingSpec } = buildRangeAggregates({
    campaign: selectedCampaign,
    rows: insightsData || [],
    metaByRange: allRanges,
    today,
    currency,
  });

  // Goal not synced yet but the data says "messages": label the objective accordingly.
  if (messagingSpec && !selectedCampaign.optimization_goal) {
    selectedCampaign = { ...selectedCampaign, optimization_goal: 'CONVERSATIONS' };
  }

  return (
    <DashboardClient 
      profile={profile} 
      client={client} 
      campaigns={campaigns}
      selectedCampaign={selectedCampaign}
      insights={insightsData || []}
      aggregatesByRange={byRange}
      today={today}
      range={range}
      lastSyncedAt={lastSyncedAt}
    />
  );
}
