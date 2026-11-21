import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MetaInsightsClient } from '@/lib/meta/server/insights';
import { MetaServerClient } from '@/lib/meta/server/client';
import { rebaseSnapshotTotals, recordCampaignEvents, snapshotAccountCampaigns } from '@/lib/events/campaign-events';
import { isIsoDay, markBackfilled, planHistoricalSync } from '@/lib/meta/server/backfill';
import { toInsightRow, upsertInsightRows } from '@/lib/meta/server/insight-rows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow 5 minutes for syncing

/** PostgREST "column does not exist" (PGRST204 schema cache / 42703 undefined_column). */
function isMissingColumnError(err: { code?: string; message?: string }): boolean {
    return err.code === 'PGRST204' || err.code === '42703' || /column .* does not exist|Could not find the .* column/i.test(err.message || '');
}

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
        // Optional manual backfill: ?since=YYYY-MM-DD&until=YYYY-MM-DD (one ranged Meta call per account).
        const rangeSince = url.searchParams.get('since');
        const rangeUntil = url.searchParams.get('until');
        const manualRange = isIsoDay(rangeSince) && isIsoDay(rangeUntil) && rangeSince <= rangeUntil ? `${rangeSince}..${rangeUntil}` : null;

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

        const syncResults: any[] = [];

        for (const conn of connections || []) {
            try {
                // Fetch ad accounts for this organization
                const { data: adAccounts, error: adError } = await supabase
                    .from('ad_accounts')
                    .select('id, meta_ad_account_id, status, timezone_name, currency')
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

                // Ad accounts are synced in parallel so a slow/broken account cannot push the whole run
                // past the scheduler's HTTP timeout (which then retries and runs the sync twice).
                await Promise.all((adAccounts || []).map(async (adAccount: any) => {
                  try {
                    if (adAccount.status !== 'active') return;

                    if (connectionHasTokenError) return;

                    // Snapshot for the Live Updates feed (never throws).
                    let eventsBefore = await snapshotAccountCampaigns(supabase, adAccount.id);

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

                        // Fetch every ad set of the account ONCE (used for ABO budgets + optimization_goal).
                        const accountAdSets: any[] = [];
                        {
                            let nextAdSetEndpoint: string | null = `/${adAccount.meta_ad_account_id}/adsets`;
                            let currentAdSetParams: Record<string, string> | undefined = {
                                fields: 'id,campaign_id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,end_time',
                                limit: '200'
                            };
                            let adSetPageCount = 0;
                            const MAX_ADSET_PAGES = 50;
                            while (nextAdSetEndpoint && adSetPageCount < MAX_ADSET_PAGES) {
                                adSetPageCount++;
                                let responseData;
                                if (nextAdSetEndpoint.startsWith('http')) {
                                    const urlObj = new URL(nextAdSetEndpoint);
                                    const parsedParams: Record<string, string> = {};
                                    urlObj.searchParams.forEach((val, key) => {
                                        if (key !== 'access_token') parsedParams[key] = val;
                                    });
                                    responseData = await metaClient.fetch(urlObj.pathname.replace(/\/v\d+\.\d+/, ''), parsedParams);
                                } else {
                                    responseData = await metaClient.fetch(nextAdSetEndpoint, currentAdSetParams || {});
                                }
                                if (responseData && Array.isArray(responseData.data)) accountAdSets.push(...responseData.data);
                                const nextUrl = responseData?.paging?.next;
                                nextAdSetEndpoint = nextUrl || null;
                                currentAdSetParams = undefined;
                            }
                            if (adSetPageCount >= MAX_ADSET_PAGES) {
                                throw new Error(`[MetadataRefresh] Reached max pagination for adsets on ${adAccount.meta_ad_account_id}. Aborting to prevent partial data sync.`);
                            }
                        }

                        let optimizationGoalColumnMissing = false;
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
                                    const allAdSets = accountAdSets;

                                    if (allAdSets.length > 0) {
                                        // Filter to only ACTIVE ad sets for this specific campaign
                                        const campaignAdSets = allAdSets.filter((adset: any) => 
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
                                    console.error(`[MetadataRefresh] Failed to fetch ad sets for ABO aggregation on campaign ${internalId}:`, abErr);
                                    // Re-throw to prevent partial data sync for this account
                                    throw abErr;
                                }
                            }

                            // Use campaign level if it exists, otherwise use the aggregated ABO values
                            const finalDailyBudget = !noDaily ? metaCampaign.daily_budget : aggregatedDailyBudget;
                            const finalLifetimeBudget = !noLifetime ? metaCampaign.lifetime_budget : aggregatedLifetimeBudget;

                            // Update existing campaign metadata.
                            // Uses meta_campaign_id as identity to prevent duplication.
                            // optimization_goal drives the "Result" metric (Ads Manager semantics): use the most
                            // common goal among the campaign's live ad sets (any ad set if none is live).
                            const campAdSets = accountAdSets.filter((as: any) => as.campaign_id === metaCampaign.meta_campaign_id);
                            const liveAdSets = campAdSets.filter((as: any) => as.effective_status === 'ACTIVE' || as.status === 'ACTIVE');
                            const goalCounts = new Map<string, number>();
                            for (const as of (liveAdSets.length ? liveAdSets : campAdSets)) {
                                if (as.optimization_goal) goalCounts.set(as.optimization_goal, (goalCounts.get(as.optimization_goal) || 0) + 1);
                            }
                            const optimizationGoal = [...goalCounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

                            // Most campaigns are scheduled at the AD SET level (campaign stop_time stays null),
                            // so a finished campaign would otherwise show "Active" forever. If the campaign has no
                            // stop_time but every non-deleted ad set has an end_time, use the latest one.
                            let effectiveEndTime: string | null = metaCampaign.end_time;
                            if (!effectiveEndTime) {
                                const scheduled = campAdSets.filter((as: any) => !['DELETED', 'ARCHIVED'].includes(String(as.status || '').toUpperCase()));
                                if (scheduled.length > 0 && scheduled.every((as: any) => !!as.end_time)) {
                                    const latest = Math.max(...scheduled.map((as: any) => new Date(as.end_time).getTime()));
                                    if (Number.isFinite(latest)) effectiveEndTime = new Date(latest).toISOString();
                                }
                            }

                            const campaignUpdate: Record<string, any> = {
                                    status: metaCampaign.status,
                                    effective_status: metaCampaign.effective_status,
                                    daily_budget: finalDailyBudget,
                                    lifetime_budget: finalLifetimeBudget,
                                    budget_source: budgetSource,
                                    start_time: metaCampaign.start_time,
                                    end_time: effectiveEndTime,
                                    objective: metaCampaign.objective,
                                    buying_type: metaCampaign.buying_type,
                                    updated_at: new Date().toISOString()
                            };
                            if (!optimizationGoalColumnMissing) campaignUpdate.optimization_goal = optimizationGoal;

                            let { error: updateError } = await supabase
                                .from('campaigns')
                                .update(campaignUpdate)
                                .eq('id', internalId);

                            if (updateError && isMissingColumnError(updateError)) {
                                optimizationGoalColumnMissing = true; // migration not applied yet
                                delete campaignUpdate.optimization_goal;
                                ({ error: updateError } = await supabase.from('campaigns').update(campaignUpdate).eq('id', internalId));
                            }

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

                        if (connectionHasTokenError) return;
                    }

                    syncResults.push({
                        account: adAccount.meta_ad_account_id,
                        type: 'metadata_refresh',
                        ...metadataRefreshResult
                    });

                    // If token error was confirmed in metadata refresh, stop now
                    if (connectionHasTokenError) return;

                    // ============================================================
                    // STEP B: INSIGHTS SYNC (D-1 and D-2) — unchanged behavior
                    // ============================================================
                    const tz = adAccount.timezone_name || 'UTC';

                    // Entries are a single day "YYYY-MM-DD" or a range "YYYY-MM-DD..YYYY-MM-DD".
                    let targetDates: string[] = [];
                    if (manualRange) {
                        targetDates.push(manualRange);
                    } else if (specificDate) {
                        targetDates.push(specificDate);
                    } else {
                        // Calculate D-0, D-1 and D-2 in the ad account's timezone
                        const formatter = new Intl.DateTimeFormat('en-CA', {
                            timeZone: tz,
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                        });

                        const now = new Date();
                        const d0Str = formatter.format(now);
                        
                        const [yStr, mStr, dayStr] = d0Str.split('-');
                        const y = parseInt(yStr, 10);
                        const m = parseInt(mStr, 10) - 1; // 0-indexed month
                        const d = parseInt(dayStr, 10);
                        
                        // Use UTC to perform safe calendar arithmetic without server timezone interference
                        const baseDate = new Date(Date.UTC(y, m, d));
                        
                        const formatCanonical = (dateObj: Date) => {
                            const yy = dateObj.getUTCFullYear();
                            const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
                            const dd = String(dateObj.getUTCDate()).padStart(2, '0');
                            return `${yy}-${mm}-${dd}`;
                        };
                        
                        targetDates.push(formatCanonical(baseDate)); // D0
                        
                        const d1Date = new Date(baseDate.getTime());
                        d1Date.setUTCDate(d1Date.getUTCDate() - 1);
                        targetDates.push(formatCanonical(d1Date)); // D1
                        
                        const d2Date = new Date(baseDate.getTime());
                        d2Date.setUTCDate(d2Date.getUTCDate() - 2);
                        targetDates.push(formatCanonical(d2Date)); // D2
                    }

                    let historical: { range: string; markThrough: string; campaignIds: string[] } | null = null;
                    // One ranged read per run: D-9..D-3 (late attribution keeps changing those days, and
                    // rows written before a field existed get it) extended back over any gap (e.g. while
                    // the token was expired). Without it lifetime/7d numbers drift from Ads Manager.
                    if (!manualRange && !specificDate) {
                        try {
                            const plan = await planHistoricalSync(supabase, { adAccountId: adAccount.id, timeZone: tz });
                            historical = { range: `${plan.since}..${plan.until}`, markThrough: plan.markThrough, campaignIds: plan.campaignIds };
                            // First, so the Live Updates baseline can be rebased right after it (see below).
                            targetDates.unshift(historical.range);
                        } catch (gapErr: any) {
                            console.warn(`[Sync] historical range planning failed for ${adAccount.meta_ad_account_id}: ${gapErr?.message || gapErr}`);
                        }
                    }

                    for (const targetDate of targetDates) {
                        const [rangeStart, rangeEnd] = targetDate.includes('..') ? targetDate.split('..') : [targetDate, targetDate];
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
                                        since: rangeStart,
                                        until: rangeEnd
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
                                        await new Promise(r => setTimeout(r, 500 * Math.pow(2, retryCount))); // Exponential backoff: 1s, 2s, 4s
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

                            const insightsPayload = (insights || []).flatMap((insight) => {
                                const internalCampaignId = campaignIdMap.get(insight.campaign_id);
                                return internalCampaignId ? [toInsightRow(insight, internalCampaignId)] : [];
                            });
                            await upsertInsightRows(supabase, insightsPayload);
                            if (historical && targetDate === historical.range) {
                                await markBackfilled(supabase, historical.campaignIds, historical.markThrough);
                            }

                            await supabase.from('sync_logs').insert({
                                ad_account_id: adAccount.id,
                                status: 'success',
                                records_synced: insightsPayload.length,
                                started_at: syncStartedAt,
                                completed_at: new Date().toISOString()
                            });

                            syncResults.push({ account: adAccount.meta_ad_account_id, date: targetDate, status: 'success', records: insightsPayload.length });

                            // Historical backfill: recovered past days are not "new results" for the feed.
                            if (targetDate.includes('..') && eventsBefore) {
                                eventsBefore = rebaseSnapshotTotals(eventsBefore, await snapshotAccountCampaigns(supabase, adAccount.id));
                            }

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

                    // Live Updates feed: diff before/after this account's sync.
                    if (!connectionHasTokenError) {
                        const eventsWritten = await recordCampaignEvents(supabase, {
                            organizationId: conn.organization_id,
                            adAccountId: adAccount.id,
                            before: eventsBefore,
                            currency: adAccount.currency ?? null,
                            timezone: adAccount.timezone_name ?? null,
                        });
                        if (eventsWritten > 0) {
                            syncResults.push({ account: adAccount.meta_ad_account_id, type: 'campaign_events', events: eventsWritten });
                        }
                    }
                  } catch (accountErr: any) {
                    console.error(`[Sync] account ${adAccount.meta_ad_account_id} failed:`, accountErr);
                    syncResults.push({ account: adAccount.meta_ad_account_id, status: 'failed', error: accountErr?.message || String(accountErr) });
                  }
                }));

                if (connectionHasTokenError) {
                    await supabase
                        .from('meta_connections')
                        .update({ status: 'disconnected' })
                        .eq('id', conn.id);
                    console.log(`[Sync] Disconnected meta_connection ${conn.id} due to OAuth token error (Code 190).`);
                    syncResults.push({ org: conn.organization_id, status: 'failed', error: 'Meta token expired or revoked (code 190); connection marked disconnected.' });
                }

            } catch (connIterError: any) {
                console.error(`Error processing connection for org ${conn.organization_id}:`, connIterError);
                syncResults.push({ org: conn.organization_id, status: 'failed', error: connIterError.message });
            }
        }

        // Non-200 on any failure so the GitHub Actions / cron caller surfaces it instead of silently "succeeding".
        if (!connections || connections.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No connected Meta connection. Reconnect Meta or save a System User token on /admin/meta.', results: syncResults },
                { status: 503 }
            );
        }
        const failed = syncResults.filter((r: any) => r?.status === 'failed');
        const succeeded = syncResults.filter((r: any) => r?.status === 'success');
        if (failed.length > 0) {
            // Partial failure (e.g. one broken ad account) -> 207: still 2xx, so the Azure Logic App's
            // retry policy does not re-run the WHOLE sync a minute later (it did after every 502).
            // Total failure stays 502 so the scheduler surfaces it.
            return NextResponse.json(
                { success: false, partial: succeeded.length > 0, failed: failed.length, total: syncResults.length, results: syncResults },
                { status: succeeded.length > 0 ? 207 : 502 }
            );
        }
        return NextResponse.json({ success: true, results: syncResults });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
