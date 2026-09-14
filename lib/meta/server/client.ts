import { decryptToken, EncryptedData } from './crypto';

const META_GRAPH_API_VERSION = 'v26.0';
const GRAPH_API_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

/**
 * The full set of campaign metadata fields fetched from Meta.
 * Meta's stop_time is mapped to end_time to match the database column name.
 */
export interface NormalizedCampaignMeta {
    meta_campaign_id: string;
    name: string;
    status: string;
    effective_status: string | null;
    objective: string | null;
    buying_type: string | null;
    /** Daily budget in major currency units (e.g. USD dollars). NULL when campaign uses lifetime budget. */
    daily_budget: number | null;
    /** Lifetime budget in major currency units (e.g. USD dollars). NULL when campaign uses daily budget. */
    lifetime_budget: number | null;
    /** ISO 8601 string suitable for PostgreSQL TIMESTAMPTZ. NULL if Meta didn't return it. */
    start_time: string | null;
    /** Mapped from Meta's stop_time field. NULL when campaign has no end date (Ongoing). */
    end_time: string | null;
}

/**
 * Normalizes a raw Meta campaign object into the NormalizedCampaignMeta shape.
 *
 * Budget normalization:
 *   Meta returns daily_budget and lifetime_budget as strings in MINOR currency units
 *   (e.g. "500" = $5.00 USD or ৳5.00 BDT).
 *   We divide by 100 to store in major currency units, matching the existing DB convention
 *   where daily_budget = 5 means $5.00.
 *
 * Date normalization:
 *   Meta returns ISO 8601 timestamps with timezone offsets (e.g. "2026-09-13T12:51:10+0600").
 *   PostgreSQL TIMESTAMPTZ accepts these directly — no conversion needed.
 *   Meta's stop_time maps to the database column end_time.
 *   NULL stop_time → NULL end_time → displayed as "Ongoing" in the UI.
 */
function normalizeCampaignMeta(raw: any): NormalizedCampaignMeta {
    const parseBudget = (value: string | undefined | null): number | null => {
        if (value === undefined || value === null || value === '') return null;
        const cents = parseInt(value, 10);
        if (isNaN(cents)) return null;
        return cents / 100; // Convert minor units → major units (cents → dollars)
    };

    const parseTimestamp = (value: string | undefined | null): string | null => {
        if (!value) return null;
        // Meta ISO strings (e.g. "2026-09-13T12:51:10+0600") are accepted
        // by PostgreSQL TIMESTAMPTZ natively.
        return value;
    };

    return {
        meta_campaign_id: raw.id,
        name: raw.name || 'Unnamed Campaign',
        status: raw.status,
        effective_status: raw.effective_status ?? null,
        objective: raw.objective ?? null,
        buying_type: raw.buying_type ?? null,
        daily_budget: parseBudget(raw.daily_budget),
        lifetime_budget: parseBudget(raw.lifetime_budget),
        start_time: parseTimestamp(raw.start_time),
        end_time: parseTimestamp(raw.stop_time), // Meta: stop_time → DB column: end_time
    };
}

/**
 * Basic server-side Meta API client.
 *
 * SECURITY: This class must only ever be instantiated server-side.
 * The decrypted access token is held in memory and never serialized or sent to the client.
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
     * Generic fetch method to call Meta Graph API.
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
            const errorObj = new Error(`Meta API Error: ${error.error?.message || 'Unknown error'}`);
            (errorObj as any).metaError = error.error;
            throw errorObj;
        }

        return await response.json();
    }

    /**
     * Retrieves the ad accounts associated with this Meta user token.
     * Normalizes the response to strip unnecessary metadata.
     */
    async getAdAccounts() {
        try {
            const data = await this.fetch('/me/adaccounts', {
                fields: 'name,account_id,account_status,currency,timezone_name'
            });

            if (!data || !Array.isArray(data.data)) {
                return [];
            }

            return data.data.map((account: any) => ({
                id: account.id,                           // e.g. act_123456789
                account_id: account.account_id,          // e.g. 123456789
                name: account.name || 'Unnamed Account',
                account_status: account.account_status,
                currency: account.currency,
                timezone_name: account.timezone_name
            }));
        } catch (error: any) {
            throw new Error(`Failed to retrieve Ad Accounts: ${error.message}`);
        }
    }

    /**
     * Retrieves campaigns for a specific ad account with full metadata.
     *
     * Returns normalized NormalizedCampaignMeta objects including:
     * - status, effective_status
     * - daily_budget and lifetime_budget (in major currency units, normalized from Meta's cents)
     * - start_time (from Meta's start_time)
     * - end_time (mapped from Meta's stop_time; NULL = Ongoing)
     *
     * NOTE: Only campaigns visible under the authenticated token are returned.
     * The caller is responsible for cross-checking against the authorized ad account.
     */
    async getCampaigns(metaAdAccountId: string): Promise<NormalizedCampaignMeta[]> {
        try {
            const accountIdStr = metaAdAccountId.startsWith('act_')
                ? metaAdAccountId
                : `act_${metaAdAccountId}`;

            let campaigns: NormalizedCampaignMeta[] = [];
            let nextEndpoint: string | null = `/${accountIdStr}/campaigns`;
            let currentParams: Record<string, string> | undefined = {
                fields: 'id,name,status,effective_status,objective,buying_type,account_id,daily_budget,lifetime_budget,start_time,stop_time'
            };

            let pageCount = 0;
            const MAX_PAGES = 50;

            while (nextEndpoint && pageCount < MAX_PAGES) {
                pageCount++;
                let urlToFetch = nextEndpoint;
                let paramsToPass = currentParams;

                let isAbsolute = urlToFetch.startsWith('http');
                let responseData;

                if (isAbsolute) {
                    const urlObj = new URL(urlToFetch);
                    const parsedParams: Record<string, string> = {};
                    urlObj.searchParams.forEach((val, key) => {
                        if (key !== 'access_token') {
                            parsedParams[key] = val;
                        }
                    });
                    responseData = await this.fetch(urlObj.pathname.replace(`/${META_GRAPH_API_VERSION}`, ''), parsedParams);
                } else {
                    responseData = await this.fetch(urlToFetch, paramsToPass || {});
                }

                if (responseData && Array.isArray(responseData.data)) {
                    campaigns.push(...responseData.data.map(normalizeCampaignMeta));
                }

                const nextUrl = responseData?.paging?.next;
                if (nextUrl) {
                    nextEndpoint = nextUrl;
                    currentParams = undefined;
                } else {
                    nextEndpoint = null;
                }
            }

            if (pageCount >= MAX_PAGES) {
                throw new Error(`[MetaServerClient] Reached maximum pagination limit of ${MAX_PAGES} for campaigns on ${accountIdStr}. Aborting to prevent partial data sync.`);
            }

            return campaigns;
        } catch (error: any) {
            throw new Error(`Failed to retrieve Campaigns: ${error.message}`);
        }
    }

    /**
     * Retrieves and normalizes full campaign metadata for an ad account.
     * Semantic alias for getCampaigns() — used in the metadata refresh cron step
     * to make the intent clear at the call site.
     */
    async getCampaignMetadata(metaAdAccountId: string): Promise<NormalizedCampaignMeta[]> {
        return this.getCampaigns(metaAdAccountId);
    }

    /**
     * Retrieves the deduplicated period-level reach for a campaign over a specific date window.
     * Returns null if insights are unavailable or on query failure.
     */
    async getCampaignPeriodReach(
        metaCampaignId: string,
        timeRange: { since: string; until: string }
    ): Promise<number | null> {
        try {
            const data = await this.fetch(`/${metaCampaignId}/insights`, {
                fields: 'reach',
                time_range: JSON.stringify(timeRange)
            });

            if (data && Array.isArray(data.data)) {
                if (data.data.length === 0) return 0;
                const reachVal = data.data[0]?.reach;
                if (reachVal !== undefined && reachVal !== null) {
                    const parsed = parseInt(reachVal, 10);
                    return isNaN(parsed) ? null : parsed;
                }
            }
            return null;
        } catch (error: any) {
            console.error(`[MetaServerClient] Failed to fetch period reach for campaign ${metaCampaignId}:`, error.message);
            return null;
        }
    }
}
