import { requireAuth } from '@/lib/supabase/auth';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Calculate dates in ad account timezone
  // Use en-CA for YYYY-MM-DD formatting
  const adminClient = createAdminClient();
  let timezoneName = 'UTC';
  
  if (selectedCampaign?.ad_account_id) {
    const { data: adAccount } = await adminClient
      .from('ad_accounts')
      .select('timezone_name')
      .eq('id', selectedCampaign.ad_account_id)
      .single();
      
    if (adAccount?.timezone_name) {
      timezoneName = adAccount.timezone_name;
    }
  }
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const now = new Date();
  const endDate = formatter.format(now); // today in the ad account's timezone

  let startDate = endDate;
  if (range === '7' || range === '14' || range === '30') {
    const days = parseInt(range, 10);
    const dN = new Date(now);
    dN.setDate(dN.getDate() - days);
    startDate = formatter.format(dN);
  }

  // 4. Fetch Insights
  let insightsQuery = supabase
    .from('campaign_insights')
    .select('*')
    .eq('campaign_id', selectedCampaign.id)
    .order('date', { ascending: true });
    
  if (range !== 'maximum') {
    insightsQuery = insightsQuery.gte('date', startDate).lte('date', endDate);
  }

  const { data: insightsData } = await insightsQuery;

  // 5. Aggregations
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalReach = 0;
  let totalClicks = 0;
  let totalMessagingConversations = 0;
  let totalMessagingCostWeighted = 0;

  if (insightsData && insightsData.length > 0) {
    insightsData.forEach(insight => {
      totalSpend += Number(insight.spend || 0);
      totalImpressions += Number(insight.impressions || 0);
      totalReach += Number(insight.reach || 0);
      totalClicks += Number(insight.clicks || 0);
      
      const msgs = Number(insight.messaging_conversations_started || 0);
      const cost = Number(insight.cost_per_messaging_conversation || 0);
      if (msgs > 0) {
        totalMessagingConversations += msgs;
        totalMessagingCostWeighted += (cost * msgs);
      }
    });
  }

  const avgDailyReach = insightsData && insightsData.length > 0 ? (totalReach / insightsData.length) : 0;

  const aggregates = {
    spend: totalSpend,
    impressions: totalImpressions,
    reach: avgDailyReach,
    clicks: totalClicks,
    cpc: totalClicks > 0 ? (totalSpend / totalClicks) : 0, 
    cpm: totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000) : 0,
    ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0,
    messaging_conversations: totalMessagingConversations,
    cost_per_messaging_conversation: totalMessagingConversations > 0 ? (totalMessagingCostWeighted / totalMessagingConversations) : null
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
