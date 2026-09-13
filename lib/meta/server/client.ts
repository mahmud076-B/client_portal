import { decryptToken, EncryptedData } from './crypto';

const META_GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

/**
 * Basic server-side Meta API client.
 */
export class MetaServerClient {
    private accessToken: string;

    /**
     * Initializes the client securely by decrypting the stored token.
     */
    constructor(encryptedData: EncryptedData) {
        this.accessToken = decryptToken(encryptedData);
    }

    /**
     * Generic fetch method to call Meta Graph API
     */
    async fetch(endpoint: string, params: Record<string, string> = {}) {
        const urlParams = new URLSearchParams({
            ...params,
            access_token: this.accessToken,
        });

        const url = `${GRAPH_API_URL}${endpoint}?${urlParams.toString()}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Meta API Error: ${error.error?.message || 'Unknown error'}`);
        }

        return await response.json();
    }

    /**
     * Retrieves the ad accounts associated with this Meta user token.
     * Normalizes the response to strip access_token or raw unnecessary metadata.
     */
    async getAdAccounts() {
        try {
            const data = await this.fetch('/me/adaccounts', {
                fields: 'name,account_id,account_status,currency,timezone_name'
            });

            // Meta typically returns a "data" array for lists
            if (!data || !Array.isArray(data.data)) {
                return [];
            }

            // Normalize the output, keeping only what's necessary
            return data.data.map((account: any) => ({
                id: account.id, // e.g. act_123456789
                account_id: account.account_id, // e.g. 123456789
                name: account.name || 'Unnamed Account',
                account_status: account.account_status,
                currency: account.currency,
                timezone_name: account.timezone_name
            }));
        } catch (error: any) {
            // Throw a safe, normalized error instead of raw Meta response
            throw new Error(`Failed to retrieve Ad Accounts: ${error.message}`);
        }
    }

    /**
     * Retrieves campaigns for a specific ad account.
     * Normalizes the response and strips raw unnecessary metadata.
     */
    async getCampaigns(metaAdAccountId: string) {
        try {
            // Note: The Ad Account ID usually starts with "act_"
            const accountIdStr = metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`;
            
            const data = await this.fetch(`/${accountIdStr}/campaigns`, {
                fields: 'id,name,status,effective_status,objective,buying_type,account_id'
            });

            if (!data || !Array.isArray(data.data)) {
                return [];
            }

            return data.data.map((campaign: any) => ({
                id: campaign.id,
                name: campaign.name || 'Unnamed Campaign',
                status: campaign.status,
                effective_status: campaign.effective_status,
                objective: campaign.objective,
                buying_type: campaign.buying_type,
                account_id: campaign.account_id
            }));
        } catch (error: any) {
            throw new Error(`Failed to retrieve Campaigns: ${error.message}`);
        }
    }

    /**
     * Retrieves insights for all campaigns under an ad account.
     * Handles pagination to fetch all available records.
     */
    async getCampaignInsights(metaAdAccountId: string, datePreset = 'lifetime') {
        try {
            const accountIdStr = metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`;
            let insights: any[] = [];
            
            // Build the initial URL parameters
            const params = new URLSearchParams({
                access_token: this.accessToken,
                level: 'campaign',
                fields: 'campaign_id,impressions,spend,clicks,cpc,cpm,ctr,reach,date_start,date_stop',
                date_preset: datePreset
            });

            let nextUrl = `${GRAPH_API_URL}/${accountIdStr}/insights?${params.toString()}`;

            while (nextUrl) {
                const response = await fetch(nextUrl);
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`Meta API Insights Error: ${error.error?.message || 'Unknown error'}`);
                }

                const data = await response.json();

                if (data && Array.isArray(data.data)) {
                    insights = insights.concat(data.data);
                }

                // Check for next page
                nextUrl = data.paging?.next || null;
            }

            // Normalize the output
            return insights.map((insight: any) => ({
                campaign_id: insight.campaign_id,
                date: insight.date_start, // For 'lifetime', it returns the start date of the reporting period
                impressions: parseInt(insight.impressions || '0', 10),
                clicks: parseInt(insight.clicks || '0', 10),
                spend: parseFloat(insight.spend || '0'),
                reach: parseInt(insight.reach || '0', 10),
                cpc: insight.cpc ? parseFloat(insight.cpc) : null,
                cpm: insight.cpm ? parseFloat(insight.cpm) : null,
                ctr: insight.ctr ? parseFloat(insight.ctr) : null,
            }));
        } catch (error: any) {
            throw new Error(`Failed to retrieve Campaign Insights: ${error.message}`);
        }
    }
}
