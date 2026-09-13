import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetaInsightsClient } from '@/lib/meta/server/insights';
import { MetaServerClient } from '@/lib/meta/server/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow 5 minutes for syncing

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');

        // Strict Bearer token validation for the cron endpoint
        if (
            !process.env.CRON_SECRET ||
            authHeader !== `Bearer ${process.env.CRON_SECRET}`
        ) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const specificDate = url.searchParams.get('date');

        const supabase = createAdminClient();

        // 1. Fetch all connected meta connections
        const { data: connections, error: connError } = await supabase
            .from('meta_connections')
            .select(`
                id,
                organization_id,
                encrypted_token,
                auth_tag,
                iv
            `)
            .eq('status', 'connected');

        if (connError) {
            throw new Error(`Failed to fetch meta connections: ${connError.message}`);
        }

        const syncResults = [];

        for (const conn of connections || []) {
            try {
                // Fetch ad accounts for this organization
                const { data: adAccounts, error: adError } = await supabase
                    .from('ad_accounts')
                    .select('id, meta_ad_account_id, status, timezone_name')
                    .eq('organization_id', conn.organization_id)
                    .eq('status', 'active');

                if (adError) {
                    throw new Error(`Failed to fetch ad accounts for org ${conn.organization_id}: ${adError.message}`);
                }

                const encryptedData = {
                    encryptedToken: conn.encrypted_token,
                    iv: conn.iv,
                    authTag: conn.auth_tag
                };

                const insightsClient = new MetaInsightsClient(encryptedData);
                const metaClient = new MetaServerClient(encryptedData);

                let connectionHasTokenError = false;

                for (const adAccount of adAccounts || []) {
                    if (adAccount.status !== 'active') continue;

                    if (connectionHasTokenError) break;

                    // ============================================================
                    // STEP A: CAMPAIGN METADATA REFRESH (isolated — never skips insights)
                    // ============================================================
                    // Failure here is logged and does NOT abort the insights sync below.
                    let metadataRefreshResult: { status: 'success' | 'failed'; campaigns_updated: number; error?: string } = {
                        status: 'success',
                        campaigns_updated: 0
                    };

                    try {
                        const metaCampaigns = await metaClient.getCampaignMetadata(adAccount.meta_ad_account_id);

                        // Fetch the DB campaigns for this ad account to find matching rows
                        const { data: dbCampaigns, error: dbCampError } = await supabase
                            .from('campaigns')
                            .select('id, meta_campaign_id')
                            .eq('ad_account_id', adAccount.id);

                        if (dbCampError) {
                            throw new Error(`Failed to fetch DB campaigns: ${dbCampError.message}`);
                        }

                        // Build a lookup: meta_campaign_id → internal UUID
                        const dbCampaignMap = new Map<string, string>();
                        for (const dbCamp of dbCampaigns || []) {
                            dbCampaignMap.set(dbCamp.meta_campaign_id, dbCamp.id);
                        }

                        let updatedCount = 0;

                        for (const metaCampaign of metaCampaigns) {
                            const internalId = dbCampaignMap.get(metaCampaign.meta_campaign_id);
                            if (!internalId) {
                                // Campaign from Meta not yet in our DB — skip (discovery handles inserts)
                                continue;
                            }

                            // ABO Support: If campaign-level budget is null (or 0), fetch ad sets and aggregate
                            let aggregatedDailyBudget: number | null = null;
                            let aggregatedLifetimeBudget: number | null = null;
                            let budgetSource: string = 'campaign';

                            const noDaily = metaCampaign.daily_budget == null || metaCampaign.daily_budget === 0;
                            const noLifetime = metaCampaign.lifetime_budget == null || metaCampaign.lifetime_budget === 0;

                            if (noDaily && noLifetime) {
                                try {
                                    // Fetch Ad Sets to aggregate active budgets
                                    const adSetsData = await metaClient.fetch(`/${adAccount.meta_ad_account_id}/adsets`, {
                                        fields: 'id,campaign_id,name,status,daily_budget,lifetime_budget'
                                    });

                                    if (adSetsData && Array.isArray(adSetsData.data)) {
                                        // Filter to only ACTIVE ad sets for this specific campaign
                                        const campaignAdSets = adSetsData.data.filter((adset: any) => 
                                            adset.campaign_id === metaCampaign.meta_campaign_id && 
                                            adset.status === 'ACTIVE'
                                        );
                                        
                                        if (campaignAdSets.length > 0) {
                                            budgetSource = 'adset_aggregated';
                                            let totalDaily = 0;
                                            let totalLifetime = 0;
                                            let hasDaily = false;
                                            let hasLifetime = false;

                                            campaignAdSets.forEach((adset: any) => {
                                                if (adset.daily_budget) {
                                                    totalDaily += parseInt(adset.daily_budget, 10) / 100;
                                                    hasDaily = true;
                                                }
                                                if (adset.lifetime_budget) {
                                                    totalLifetime += parseInt(adset.lifetime_budget, 10) / 100;
                                                    hasLifetime = true;
                                                }
                                            });

                                            if (hasDaily) aggregatedDailyBudget = totalDaily;
                                            if (hasLifetime) aggregatedLifetimeBudget = totalLifetime;
                                        }
                                    }
                                } catch (abErr) {
                                    console.warn(`[MetadataRefresh] Failed to fetch ad sets for ABO aggregation on campaign ${internalId}:`, abErr);
                                }
                            }

                            // Use campaign level if it exists, otherwise use the aggregated ABO values
                            const finalDailyBudget = !noDaily ? metaCampaign.daily_budget : aggregatedDailyBudget;
                            const finalLifetimeBudget = !noLifetime ? metaCampaign.lifetime_budget : aggregatedLifetimeBudget;

                            // Update existing campaign metadata.
                            // Uses meta_campaign_id as identity to prevent duplication.
                            const { error: updateError } = await supabase
                                .from('campaigns')
                                .update({
                                    status: metaCampaign.status,
                                    effective_status: metaCampaign.effective_status,
                                    daily_budget: finalDailyBudget,
                                    lifetime_budget: finalLifetimeBudget,
                                    budget_source: budgetSource,
                                    start_time: metaCampaign.start_time,
                                    end_time: metaCampaign.end_time,
                                    objective: metaCampaign.objective,
                                    buying_type: metaCampaign.buying_type,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', internalId);

                            if (updateError) {
                                console.warn(`[MetadataRefresh] Failed to update campaign ${internalId}: ${updateError.message}`);
                                continue;
                            }

                            updatedCount++;
                        }

                        metadataRefreshResult = { status: 'success', campaigns_updated: updatedCount };
                        console.log(`[MetadataRefresh] ad_account=${adAccount.meta_ad_account_id} updated=${updatedCount} campaigns`);

                    } catch (metaRefreshError: any) {
                        // Isolated failure: log and continue to insights sync
                        const metaError = metaRefreshError.metaError;
                        if (metaError && metaError.code === 190) {
                            // Token error detected during metadata refresh — mark for disconnection
                            connectionHasTokenError = true;
                        }
                        metadataRefreshResult = {
                            status: 'failed',
                            campaigns_updated: 0,
                            error: metaRefreshError.message
                        };
                        console.error(`[MetadataRefresh] Failed for ad_account=${adAccount.meta_ad_account_id}: ${metaRefreshError.message}`);

                        if (connectionHasTokenError) break;
                    }

                    syncResults.push({
                        account: adAccount.meta_ad_account_id,
                        type: 'metadata_refresh',
                        ...metadataRefreshResult
                    });

                    // If token error was confirmed in metadata refresh, stop now
                    if (connectionHasTokenError) break;

                    // ============================================================
                    // STEP B: INSIGHTS SYNC (D-1 and D-2) — unchanged behavior
                    // ============================================================
                    const tz = adAccount.timezone_name || 'UTC';

                    let targetDates: string[] = [];
                    if (specificDate) {
                        targetDates.push(specificDate);
                    } else {
                        // Calculate D-0, D-1 and D-2 in the ad account's timezone
                        const localDateString = new Date().toLocaleString('en-US', { timeZone: tz });
                        const d0 = new Date(localDateString);
                        const d1 = new Date(localDateString);
                        d1.setDate(d1.getDate() - 1);
                        const d2 = new Date(localDateString);
                        d2.setDate(d2.getDate() - 2);

                        const format = (d: Date) => {
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${y}-${m}-${day}`;
                        };

                        targetDates.push(format(d0));
                        targetDates.push(format(d1));
                        targetDates.push(format(d2));
                    }

                    for (const targetDate of targetDates) {
                        const syncStartedAt = new Date().toISOString();

                        try {
                            // Fetch insights from Meta with bounded retries
                            let insights;
                            let retryCount = 0;
                            const maxRetries = 3;
                            let lastError;

                            while (retryCount <= maxRetries) {
                                try {
                                    insights = await insightsClient.getDailyCampaignInsights(adAccount.meta_ad_account_id, {
                                        since: targetDate,
                                        until: targetDate
                                    });
                                    lastError = null;
                                    break;
                                } catch (e: any) {
                                    lastError = e;
                                    const metaError = e.metaError;

                                    if (metaError && metaError.code === 190) {
                                        connectionHasTokenError = true;
                                        break; // Token invalidation is permanent
                                    }

                                    // 4xx errors are usually permanent logic/permission errors
                                    if (metaError && metaError.code >= 400 && metaError.code < 500) {
                                        break;
                                    }

                                    retryCount++;
                                    if (retryCount <= maxRetries) {
                                        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount))); // Exponential backoff
                                    }
                                }
                            }

                            if (connectionHasTokenError) {
                                break; // Break targetDate loop
                            }

                            if (lastError) {
                                throw lastError;
                            }

                            // Map meta_campaign_id to internal ID
                            const { data: dbCampaigns, error: campError } = await supabase
                                .from('campaigns')
                                .select('id, meta_campaign_id')
                                .eq('ad_account_id', adAccount.id);

                            if (campError) {
                                throw new Error(`Failed to fetch db campaigns: ${campError.message}`);
                            }

                            const campaignIdMap = new Map();
                            for (const camp of dbCampaigns || []) {
                                campaignIdMap.set(camp.meta_campaign_id, camp.id);
                            }

                            const insightsPayload = [];
                            for (const insight of insights || []) {
                                const internalCampaignId = campaignIdMap.get(insight.campaign_id);
                                if (internalCampaignId) {
                                    insightsPayload.push({
                                        campaign_id: internalCampaignId,
                                        date: insight.date,
                                        impressions: insight.impressions,
                                        clicks: insight.clicks,
                                        spend: insight.spend,
                                        reach: insight.reach,
                                        cpc: insight.cpc,
                                        cpm: insight.cpm,
                                        ctr: insight.ctr,
                                        messaging_conversations_started: insight.messaging_conversations_started,
                                        cost_per_messaging_conversation: insight.cost_per_messaging_conversation,
                                        updated_at: new Date().toISOString()
                                    });
                                }
                            }

                            if (insightsPayload.length > 0) {
                                const { error: upsertError } = await supabase
                                    .from('campaign_insights')
                                    .upsert(insightsPayload, {
                                        onConflict: 'campaign_id,date',
                                        ignoreDuplicates: false
                                    });

                                if (upsertError) {
                                    throw new Error(`Upsert error: ${upsertError.message}`);
                                }
                            }

                            await supabase.from('sync_logs').insert({
                                ad_account_id: adAccount.id,
                                status: 'success',
                                records_synced: insightsPayload.length,
                                started_at: syncStartedAt,
                                completed_at: new Date().toISOString()
                            });

                            syncResults.push({ account: adAccount.meta_ad_account_id, date: targetDate, status: 'success', records: insightsPayload.length });

                        } catch (dateError: any) {
                            const metaError = dateError.metaError;
                            if (metaError && metaError.code === 190) {
                                connectionHasTokenError = true;
                            }

                            await supabase.from('sync_logs').insert({
                                ad_account_id: adAccount.id,
                                status: 'failed',
                                error_message: dateError.message || String(dateError),
                                records_synced: 0,
                                started_at: syncStartedAt,
                                completed_at: new Date().toISOString()
                            });
                            syncResults.push({ account: adAccount.meta_ad_account_id, date: targetDate, status: 'failed', error: dateError.message });

                            if (connectionHasTokenError) {
                                break;
                            }
                        }
                    }
                }

                if (connectionHasTokenError) {
                    await supabase
                        .from('meta_connections')
                        .update({ status: 'disconnected' })
                        .eq('id', conn.id);
                    console.log(`[Sync] Disconnected meta_connection ${conn.id} due to OAuth token error (Code 190).`);
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
