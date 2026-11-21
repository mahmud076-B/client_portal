import { requireAuth } from '@/lib/supabase/auth';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetaServerClient, type CampaignPeriodTotals } from '@/lib/meta/server/client';
import { addDays, dayIn } from '@/lib/meta/server/backfill';
import { resolveResultSpec, resolveResultSpecForData, computeResult } from '@/lib/meta/results';

export const dynamic = 'force-dynamic';

export type DashboardRange = 'today' | '7' | '14' | '30' | 'maximum';

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

  // Calculate dates in ad account timezone (Ads Manager reports in the ad account's timezone).
  const adminClient = createAdminClient();
  let timezoneName = 'UTC';
  let organizationId: string | null = null;
  let currency: string | null = null;

  if (selectedCampaign?.ad_account_id) {
    const { data: adAccount } = await adminClient
      .from('ad_accounts')
      .select('organization_id, timezone_name, currency')
      .eq('id', selectedCampaign.ad_account_id)
      .single();

    if (adAccount?.timezone_name) timezoneName = adAccount.timezone_name;
    if (adAccount?.organization_id) organizationId = adAccount.organization_id;
    currency = adAccount?.currency ?? null;
  }

  // "7d" = today + the 6 days before it (7 calendar days, inclusive), like Ads Manager's
  // custom range ending today. Previously this was 8 days (today-7 .. today).
  const endDate = dayIn(timezoneName);
  let startDate = endDate;
  if (range === '7' || range === '14' || range === '30') {
    startDate = addDays(endDate, -(parseInt(range, 10) - 1));
  }

  // 4. Daily rows from our DB (charts + fallback totals)
  let insightsQuery = supabase
    .from('campaign_insights')
    .select('*')
    .eq('campaign_id', selectedCampaign.id)
    .order('date', { ascending: true });

  if (range !== 'maximum') {
    insightsQuery = insightsQuery.gte('date', startDate).lte('date', endDate);
  }

  const { data: insightsData } = await insightsQuery;

  // 5. Fallback aggregation from synced daily rows
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalMessagingConversations = 0;

  for (const insight of insightsData || []) {
    totalSpend += Number(insight.spend || 0);
    totalImpressions += Number(insight.impressions || 0);
    totalClicks += Number(insight.clicks || 0);
    totalMessagingConversations += Number(insight.messaging_conversations_started || 0);
  }

  // 6. Period totals straight from Meta: ONE aggregated query, so spend, impressions,
  // de-duplicated reach and results all describe the same period and match Ads Manager.
  // Falls back to the synced daily rows if Meta is unreachable.
  let metaTotals: CampaignPeriodTotals | null = null;
  if (selectedCampaign?.meta_campaign_id && organizationId) {
    try {
      const { data: conn } = await adminClient
        .from('meta_connections')
        .select('encrypted_token, iv, auth_tag')
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .single();

      if (conn?.encrypted_token && conn?.iv && conn?.auth_tag) {
        const metaClient = new MetaServerClient({
          encryptedToken: conn.encrypted_token,
          iv: conn.iv,
          authTag: conn.auth_tag
        });
        metaTotals = await metaClient.getCampaignPeriodTotals(
          selectedCampaign.meta_campaign_id,
          range === 'maximum' ? { preset: 'maximum' } : { since: startDate, until: endDate }
        );
      }
    } catch (metaErr: any) {
      console.error('[Dashboard] Error fetching period totals from Meta:', metaErr.message || metaErr);
      metaTotals = null;
    }
  }

  const spend = metaTotals ? metaTotals.spend : totalSpend;
  const impressions = metaTotals ? metaTotals.impressions : totalImpressions;
  const clicks = metaTotals ? metaTotals.clicks : totalClicks;
  const reach = metaTotals ? metaTotals.reach : null; // daily reach is not additive: only Meta's period reach is valid

  // 7. Objective-aware result (messages, follows, ThruPlays, purchases, leads, ...)
  const resultSpec =
    resolveResultSpecForData(selectedCampaign?.objective, selectedCampaign?.optimization_goal, [
      ...(insightsData || []),
      ...(metaTotals ? [{ actions: metaTotals.actions }] : []),
    ]) ??
    resolveResultSpec(totalMessagingConversations > 0 ? 'MESSAGES' : 'OUTCOME_TRAFFIC');

  // Goal not synced yet but the data says "messages": label the objective accordingly.
  if (resultSpec?.key === 'messaging' && !selectedCampaign.optimization_goal) {
    selectedCampaign = { ...selectedCampaign, optimization_goal: 'CONVERSATIONS' };
  }

  const resultRows = metaTotals
    ? [{
        date: metaTotals.date_stop || endDate,
        spend,
        impressions,
        reach,
        actions: metaTotals.actions,
        action_values: metaTotals.action_values,
        video_thruplays: metaTotals.video_thruplays,
      }]
    : (insightsData || []);
  const result = resultSpec
    ? computeResult(resultSpec, resultRows, { totalSpend: spend, periodReach: reach, totalImpressions: impressions })
    : null;
  // Keep the per-day series for charts from the DB rows.
  if (result && metaTotals && resultSpec) {
    result.daily = computeResult(resultSpec, insightsData || [], { totalSpend: totalSpend }).daily;
  }

  const aggregates = {
    spend,
    impressions,
    reach,
    clicks,
    frequency: metaTotals?.frequency ?? (reach && impressions ? impressions / reach : null),
    cpc: clicks > 0 ? (spend / clicks) : null,
    cpm: impressions > 0 ? ((spend / impressions) * 1000) : null,
    ctr: impressions > 0 ? ((clicks / impressions) * 100) : 0,
    messaging_conversations: totalMessagingConversations,
    result,
    currency,
    source: metaTotals ? ('meta' as const) : ('synced' as const),
    period: range === 'maximum'
      ? { since: metaTotals?.date_start ?? insightsData?.[0]?.date ?? null, until: metaTotals?.date_stop ?? insightsData?.at(-1)?.date ?? null }
      : { since: startDate, until: endDate },
  };

  // 6. Fetch Last Synced Timestamp
  let lastSyncedAt: string | null = null;
  
  if (selectedCampaign?.ad_account_id) {
    const { data: syncLog } = await adminClient
      .from('sync_logs')
      .select('completed_at')
      .eq('ad_account_id', selectedCampaign.ad_account_id)
      .eq('status', 'success')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();
      
    if (syncLog?.completed_at) {
      lastSyncedAt = syncLog.completed_at;
    }
  }

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
