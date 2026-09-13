import { requireAuth } from '@/lib/supabase/auth';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  let session;
  try {
    session = await requireAuth();
  } catch (err) {
    // If not authenticated, redirect to login
    redirect('/login');
  }

  const { profile, client } = session;
  const supabase = await createClient();

  // Fetch insights
  const { data: insightsData } = await supabase
    .from('campaign_insights')
    .select('*');

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalReach = 0;
  let totalClicks = 0;

  if (insightsData) {
    insightsData.forEach(insight => {
      totalSpend += Number(insight.spend || 0);
      totalImpressions += Number(insight.impressions || 0);
      totalReach += Number(insight.reach || 0);
      totalClicks += Number(insight.clicks || 0);
    });
  }

  const initialInsights = {
    spend: totalSpend,
    impressions: totalImpressions,
    reach: totalReach,
    clicks: totalClicks,
    cpr: totalClicks > 0 ? (totalSpend / totalClicks) : 0, 
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  };

  return (
    <DashboardClient profile={profile} client={client} initialInsights={initialInsights} />
  );
}
