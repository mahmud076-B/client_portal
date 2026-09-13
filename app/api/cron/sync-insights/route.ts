import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetaServerClient } from '@/lib/meta/server/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow 5 minutes for syncing

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        
        // Simple Bearer token validation for the cron endpoint
        if (
            process.env.CRON_SECRET && 
            authHeader !== `Bearer ${process.env.CRON_SECRET}`
        ) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createAdminClient();

        // 1. Fetch all connected ad accounts and their Meta credentials
        const { data: connections, error: connError } = await supabase
            .from('meta_connections')
            .select(`
                organization_id,
                encrypted_token,
                auth_tag,
                iv,
                ad_accounts (
                    id,
                    meta_account_id,
                    status
                )
            `)
            .eq('status', 'active');

        if (connError) {
            throw new Error(`Failed to fetch meta connections: ${connError.message}`);
        }

        const syncResults = [];

        for (const conn of connections || []) {
            try {
                const metaClient = new MetaServerClient({
                    encryptedToken: conn.encrypted_token,
                    iv: conn.iv,
                    authTag: conn.auth_tag
                });

                for (const adAccount of conn.ad_accounts || []) {
                    if (adAccount.status !== 'active') continue;

                    try {
                        // 2. Fetch insights from Meta
                        const insights = await metaClient.getCampaignInsights(adAccount.meta_account_id, 'lifetime');

                        // 3. For each insight, we need to map the meta_campaign_id to our internal campaign ID
                        // First, fetch the campaigns for this ad account
                        const { data: dbCampaigns, error: campError } = await supabase
                            .from('campaigns')
                            .select('id, meta_campaign_id')
                            .eq('ad_account_id', adAccount.id);

                        if (campError) {
                            throw new Error(`Failed to fetch db campaigns: ${campError.message}`);
                        }

                        // Create a map of meta_campaign_id -> our internal id
                        const campaignIdMap = new Map();
                        for (const camp of dbCampaigns || []) {
                            campaignIdMap.set(camp.meta_campaign_id, camp.id);
                        }

                        // Prepare the payload for upsert
                        const insightsPayload = [];
                        for (const insight of insights) {
                            const internalCampaignId = campaignIdMap.get(insight.campaign_id);
                            
                            // Only insert insights if we have the campaign in our DB
                            if (internalCampaignId) {
                                insightsPayload.push({
                                    campaign_id: internalCampaignId,
                                    date: insight.date, // Usually the start date of the reporting period
                                    impressions: insight.impressions,
                                    clicks: insight.clicks,
                                    spend: insight.spend,
                                    reach: insight.reach,
                                    cpc: insight.cpc,
                                    cpm: insight.cpm,
                                    ctr: insight.ctr,
                                    updated_at: new Date().toISOString()
                                });
                            }
                        }

                        // 4. Upsert into campaign_insights
                        if (insightsPayload.length > 0) {
                            const { error: upsertError } = await supabase
                                .from('campaign_insights')
                                .upsert(insightsPayload, { 
                                    onConflict: 'campaign_id,date',
                                    ignoreDuplicates: false // We want to update existing rows with fresh data
                                });

                            if (upsertError) {
                                throw new Error(`Upsert error: ${upsertError.message}`);
                            }
                        }

                        // Log success
                        await supabase.from('sync_logs').insert({
                            ad_account_id: adAccount.id,
                            sync_type: 'insights_sync',
                            status: 'success',
                            records_processed: insightsPayload.length
                        });

                        syncResults.push({ account: adAccount.meta_account_id, status: 'success', records: insightsPayload.length });

                    } catch (accountError: any) {
                        // Log failure for this specific account but continue processing others
                        await supabase.from('sync_logs').insert({
                            ad_account_id: adAccount.id,
                            sync_type: 'insights_sync',
                            status: 'failed',
                            error_message: accountError.message
                        });
                        syncResults.push({ account: adAccount.meta_account_id, status: 'failed', error: accountError.message });
                    }
                }
            } catch (connIterError: any) {
                console.error(`Error processing connection for org ${conn.organization_id}:`, connIterError);
                syncResults.push({ org: conn.organization_id, status: 'failed', error: connIterError.message });
            }
        }

        return NextResponse.json({ success: true, results: syncResults });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
