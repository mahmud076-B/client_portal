import { requireAuth } from '@/lib/supabase/auth';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dayIn } from '@/lib/dates';
import { getCampaignPeriodTotalsCached } from '@/lib/meta/server/period-totals';
import { buildDashboardTotals, rangeWindow } from '@/lib/campaigns/dashboard-totals';

export const dynamic = 'force-dynamic';

export type { DashboardRange } from '@/lib/campaigns/dashboard-totals';
import type { DashboardRange } from '@/lib/campaigns/dashboard-totals';

export default async function DashboardPage(
  props: { searchParams: Promise<{ campaignId?: string, days?: string, range?: string }> }
) {
  let session;
  try {
    session = await requireAuth();
  } catch (err) {
    // If not authenticated, redirect to login
    redirect('/login');
  }

  const searchParams = await props.searchParams;
  const { profile, client } = session;
  const supabase = await createClient();

  // 1. Fetch campaigns assigned to this client.
  // The RLS policy "Clients can read assigned campaigns" will ensure only authorized campaigns are returned.
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*, ad_accounts(id, timezone_name)');

  if (!campaigns || campaigns.length === 0) {
    return (
      <DashboardClient 
        profile={profile} 
        client={client} 
        campaigns={[]} 
        selectedCampaign={null} 
        insights={[]}
        aggregates={null}
        range="7"
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

  // 3. Determine date range (support legacy `days` parameter as fallback)
  let rawRange = searchParams.range || searchParams.days || '7';
  if (!['today', 'maximum', '7', '14', '30'].includes(rawRange)) {
    rawRange = '7'; // fallback
  }
  const range = rawRange as DashboardRange;

  // 4. Ad account (timezone/currency/org) + last sync in parallel.
  const adminClient = createAdminClient();
  const [{ data: adAccount }, { data: syncLog }] = await Promise.all([
    selectedCampaign?.ad_account_id
      ? adminClient.from('ad_accounts').select('organization_id, timezone_name, currency').eq('id', selectedCampaign.ad_account_id).single()
      : Promise.resolve({ data: null }),
    selectedCampaign?.ad_account_id
      ? adminClient
          .from('sync_logs')
          .select('completed_at')
          .eq('ad_account_id', selectedCampaign.ad_account_id)
          .eq('status', 'success')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const timezoneName: string = adAccount?.timezone_name || 'UTC';
  const organizationId: string | null = adAccount?.organization_id ?? null;
  const currency: string | null = adAccount?.currency ?? null;
  const lastSyncedAt: string | null = syncLog?.completed_at ?? null;

  // Ads Manager reports in the ad account timezone.
  const { since: startDate, until: endDate } = rangeWindow(range, dayIn(timezoneName));

  // 5. Daily rows from our DB (charts + fallback) and the Meta period totals, in parallel.
  let insightsQuery = supabase
    .from('campaign_insights')
    .select('*')
    .eq('campaign_id', selectedCampaign.id)
    .order('date', { ascending: true });
  if (range !== 'maximum') {
    insightsQuery = insightsQuery.gte('date', startDate).lte('date', endDate);
  }

  const [{ data: insightsData }, metaTotals] = await Promise.all([
    insightsQuery,
    // ONE aggregated Meta query: spend, impressions, de-duplicated reach and results all
    // describe the same period and match Ads Manager. Cached 5 min.
    selectedCampaign?.meta_campaign_id && organizationId
      ? getCampaignPeriodTotalsCached(
          organizationId,
          selectedCampaign.meta_campaign_id,
          range === 'maximum' ? { preset: 'maximum' } : { since: startDate, until: endDate }
        )
      : Promise.resolve(null),
  ]);

  // 6. Totals + objective-aware result (shared, unit-tested logic)
  const { totals, resultSpec, result } = buildDashboardTotals({
    campaign: selectedCampaign,
    rows: insightsData || [],
    meta: metaTotals,
    endDate,
  });

  // Goal not synced yet but the data says "messages": label the objective accordingly.
  if (resultSpec?.key === 'messaging' && !selectedCampaign.optimization_goal) {
    selectedCampaign = { ...selectedCampaign, optimization_goal: 'CONVERSATIONS' };
  }

  const aggregates = {
    ...totals,
    result,
    currency,
    period: range === 'maximum'
      ? { since: metaTotals?.date_start ?? insightsData?.[0]?.date ?? null, until: metaTotals?.date_stop ?? insightsData?.at(-1)?.date ?? null }
      : { since: startDate, until: endDate },
  };

  return (
    <DashboardClient 
      profile={profile} 
      client={client} 
      campaigns={campaigns}
      selectedCampaign={selectedCampaign}
      insights={insightsData || []}
      aggregates={aggregates}
      range={range}
      lastSyncedAt={lastSyncedAt}
    />
  );
}
