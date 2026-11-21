import { MetaServerClient } from './client';
import { EncryptedData } from './crypto';

export interface NormalizedCampaignInsight {
    campaign_id: string;
    date: string;
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
    spend: number | null;
    cpc: number | null;
    cpm: number | null;
    ctr: number | null;
    messaging_conversations_started: number;
    cost_per_messaging_conversation: number | null;
    /** Raw Meta arrays kept so the UI can compute the objective-specific "Result". */
    actions: any[] | null;
    action_values: any[] | null;
    cost_per_action_type: any[] | null;
    video_thruplays: number | null;
    frequency: number | null;
}

export class MetaInsightsClient {
    private client: MetaServerClient;

    constructor(encryptedData: EncryptedData) {
        this.client = new MetaServerClient(encryptedData);
    }

    /**
     * Parses numeric values safely. Missing fields are returned as null.
     */
    private parseNumeric(value: any, isInteger = false): number | null {
        if (value === undefined || value === null || value === '') return null;
        
        const parsed = isInteger ? parseInt(value, 10) : parseFloat(value);
        if (isNaN(parsed)) return null;
        
        return parsed;
    }

    /** Sums an AdsActionStats array (e.g. video_thruplay_watched_actions). Missing → 0 (row exists = delivered). */
    private sumActionValues(list: any): number {
        if (!Array.isArray(list)) return 0;
        return list.reduce((sum: number, a: any) => {
            const n = parseFloat(a?.value);
            return isNaN(n) ? sum : sum + n;
        }, 0);
    }

    /**
     * Extracts messaging conversation metrics from raw Meta actions arrays.
     */
    private parseMessagingMetrics(row: any): { messaging_conversations_started: number; cost_per_messaging_conversation: number | null } {
        let messaging_conversations_started = 0;
        let cost_per_messaging_conversation: number | null = null;
        
        const actionType = 'onsite_conversion.messaging_conversation_started_7d';
        
        if (Array.isArray(row.actions)) {
            const msgAction = row.actions.find((a: any) => a.action_type === actionType);
            if (msgAction && msgAction.value) {
                const parsed = parseInt(msgAction.value, 10);
                if (!isNaN(parsed)) messaging_conversations_started = parsed;
            }
        }
        
        if (Array.isArray(row.cost_per_action_type)) {
            const msgCost = row.cost_per_action_type.find((c: any) => c.action_type === actionType);
            if (msgCost && msgCost.value) {
                const parsed = parseFloat(msgCost.value);
                if (!isNaN(parsed)) cost_per_messaging_conversation = parsed;
            }
        }
        
        return {
            messaging_conversations_started,
            cost_per_messaging_conversation
        };
    }

    /**
     * Retrieves daily insights for campaigns under an ad account for a specific date window.
     * Implements pagination and normalizes response safely.
     */
    async getDailyCampaignInsights(
        metaAdAccountId: string,
        timeRange: { since: string; until: string }
    ): Promise<NormalizedCampaignInsight[]> {
        const accountIdStr = metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`;
        let insights: NormalizedCampaignInsight[] = [];
        
        const initialParams = {
            level: 'campaign',
            fields: 'campaign_id,impressions,reach,frequency,clicks,spend,cpc,cpm,ctr,actions,action_values,cost_per_action_type,video_thruplay_watched_actions',
            time_range: JSON.stringify(timeRange),
            // One row per campaign per DAY (ranged backfills rely on this; a no-op for single days).
            time_increment: '1'
        };

        try {
            let nextEndpoint: string | null = `/${accountIdStr}/insights`;
            let currentParams: Record<string, string> | undefined = initialParams;

            // Failsafe against infinite loops (e.g. max 50 pages)
            let pageCount = 0;
            const MAX_PAGES = 50;

            while (nextEndpoint && pageCount < MAX_PAGES) {
                pageCount++;
                
                // If currentParams is undefined, it means we are following a paging.next URL
                // which already contains all query parameters including the access token.
                // However, MetaServerClient.fetch automatically appends access_token if we pass params.
                // To avoid breaking the next URL, we can parse it and just call fetch.
                let urlToFetch = nextEndpoint;
                let paramsToPass = currentParams;

                // Meta Server Client handles fetch by prepending the Graph API URL if it's a relative endpoint.
                // But paging.next returns an absolute URL.
                let isAbsolute = urlToFetch.startsWith('http');
                
                let responseData;
                if (isAbsolute) {
                    // Extract query params from the absolute URL and use the base client
                    const urlObj = new URL(urlToFetch);
                    const parsedParams: Record<string, string> = {};
                    urlObj.searchParams.forEach((val, key) => {
                        if (key !== 'access_token') {
                            parsedParams[key] = val;
                        }
                    });
                    responseData = await this.client.fetch(urlObj.pathname.replace('/v26.0', ''), parsedParams);
                } else {
                    responseData = await this.client.fetch(urlToFetch, paramsToPass);
                }
                
                if (responseData && Array.isArray(responseData.data)) {
                    for (const row of responseData.data) {
                        if (!row.campaign_id || !row.date_start) {
                            console.warn(`[MetaInsightsClient] Skipping malformed row: missing campaign_id or date_start`);
                            continue;
                        }

                        const messagingMetrics = this.parseMessagingMetrics(row);

                        const normalizedRow: NormalizedCampaignInsight = {
                            campaign_id: row.campaign_id,
                            date: row.date_start,
                            impressions: this.parseNumeric(row.impressions, true),
                            reach: this.parseNumeric(row.reach, true),
                            clicks: this.parseNumeric(row.clicks, true),
                            spend: this.parseNumeric(row.spend),
                            cpc: this.parseNumeric(row.cpc),
                            cpm: this.parseNumeric(row.cpm),
                            ctr: this.parseNumeric(row.ctr),
                            messaging_conversations_started: messagingMetrics.messaging_conversations_started,
                            cost_per_messaging_conversation: messagingMetrics.cost_per_messaging_conversation,
                            actions: Array.isArray(row.actions) ? row.actions : [],
                            action_values: Array.isArray(row.action_values) ? row.action_values : [],
                            cost_per_action_type: Array.isArray(row.cost_per_action_type) ? row.cost_per_action_type : [],
                            video_thruplays: this.sumActionValues(row.video_thruplay_watched_actions),
                            frequency: this.parseNumeric(row.frequency)
                        };
                        
                        insights.push(normalizedRow);
                    }
                }

                // Check for pagination
                const nextUrl = responseData.paging?.next;
                if (nextUrl) {
                    nextEndpoint = nextUrl;
                    currentParams = undefined;
                } else {
                    nextEndpoint = null;
                }
            }

            if (pageCount >= MAX_PAGES) {
                console.warn(`[MetaInsightsClient] Reached maximum pagination limit of ${MAX_PAGES} for ad account ${accountIdStr}`);
            }

            return insights;
        } catch (error: any) {
            // Rethrow structured errors
            throw error;
        }
    }
}
