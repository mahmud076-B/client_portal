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

/** Every campaign effective_status the account /campaigns edge accepts as a filter (DELETED is not allowed). */
const CAMPAIGN_EDGE_STATUSES = [
    'ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW',
    'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED',
];

/** Campaign totals for a period, exactly as Ads Manager aggregates them (one Meta call). */
export interface CampaignPeriodTotals {
    spend: number;
    impressions: number;
    reach: number | null;
    clicks: number;
    link_clicks: number;
    frequency: number | null;
    actions: unknown[];
    action_values: unknown[];
    cost_per_action_type: unknown[];
    video_thruplays: number | null;
    date_start: string | null;
    date_stop: string | null;
}

export const PERIOD_TOTALS_FIELDS =
    'spend,impressions,reach,clicks,inline_link_clicks,frequency,actions,action_values,cost_per_action_type,video_thruplay_watched_actions';

/** One Meta insights row (no time_increment) -> CampaignPeriodTotals. Empty period -> zeros. */
export function parsePeriodTotalsRow(row: any): CampaignPeriodTotals {
    const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
    if (!row) {
        return { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, frequency: null, actions: [], action_values: [], cost_per_action_type: [], video_thruplays: 0, date_start: null, date_stop: null };
    }
    const thru = Array.isArray(row.video_thruplay_watched_actions)
        ? row.video_thruplay_watched_actions.reduce((s: number, a: any) => s + num(a?.value), 0)
        : null;
    return {
        spend: num(row.spend),
        impressions: num(row.impressions),
        reach: row.reach != null ? num(row.reach) : null,
        clicks: num(row.clicks),
        link_clicks: num(row.inline_link_clicks),
        frequency: row.frequency != null ? num(row.frequency) : null,
        actions: Array.isArray(row.actions) ? row.actions : [],
        action_values: Array.isArray(row.action_values) ? row.action_values : [],
        cost_per_action_type: Array.isArray(row.cost_per_action_type) ? row.cost_per_action_type : [],
        video_thruplays: thru,
        date_start: row.date_start ?? null,
        date_stop: row.date_stop ?? null,
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
            const error = await response.json().catch(() => ({}));
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
            const wrapped = new Error(`Failed to retrieve Ad Accounts: ${error.message}`);
            (wrapped as any).metaError = error.metaError; // keep Meta code/subcode for callers
            throw wrapped;
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
    async getCampaigns(metaAdAccountId: string, opts: { includeArchived?: boolean } = {}): Promise<NormalizedCampaignMeta[]> {
        try {
            const accountIdStr = metaAdAccountId.startsWith('act_')
                ? metaAdAccountId
                : `act_${metaAdAccountId}`;

            let campaigns: NormalizedCampaignMeta[] = [];
            let nextEndpoint: string | null = `/${accountIdStr}/campaigns`;
            let currentParams: Record<string, string> | undefined = {
                fields: 'id,name,status,effective_status,objective,buying_type,account_id,daily_budget,lifetime_budget,start_time,stop_time',
                limit: '200',
                // The edge hides ARCHIVED/DELETED by default; the status refresh must see them so they stop showing "Active".
                // DELETED must NOT be listed: the edge rejects it with (#100) "Invalid parameter"
                // (subcode 1815001, "Cannot Request for Deleted Objects"), which broke every metadata refresh.
                ...(opts.includeArchived
                    ? { effective_status: JSON.stringify(CAMPAIGN_EDGE_STATUSES) }
                    : {})
            };

            let pageCount = 0;
            const MAX_PAGES = 50;

            while (nextEndpoint && pageCount < MAX_PAGES) {
                pageCount++;
                let urlToFetch = nextEndpoint;
                let paramsToPass: Record<string, string> | undefined = currentParams;

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
                    try {
                        responseData = await this.fetch(urlToFetch, paramsToPass || {});
                    } catch (e: any) {
                        // Status filter rejected (#100): retry once with Meta's default filter rather than failing the refresh.
                        if (e?.metaError?.code === 100 && paramsToPass?.effective_status) {
                            const { effective_status: _drop, ...rest }: Record<string, string> = paramsToPass;
                            console.warn(`[MetaServerClient] effective_status filter rejected on ${accountIdStr}; retrying without it.`);
                            currentParams = rest;
                            responseData = await this.fetch(urlToFetch, rest);
                        } else {
                            throw e;
                        }
                    }
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
        return this.getCampaigns(metaAdAccountId, { includeArchived: true });
    }

    /**
     * Campaign-level totals for a window (or lifetime with `{ preset: 'maximum' }`).
     * Spend/impressions/reach/results come from ONE aggregated query, so they always describe the
     * same period and match Ads Manager (deduplicated reach, attribution-adjusted actions).
     * Returns null on failure; an empty object of zeros when the campaign had no delivery.
     */
    async getCampaignPeriodTotals(
        metaCampaignId: string,
        window: { since: string; until: string } | { preset: 'maximum' }
    ): Promise<CampaignPeriodTotals | null> {
        try {
            const params: Record<string, string> = {
                fields: PERIOD_TOTALS_FIELDS,
            };
            if ('preset' in window) params.date_preset = 'maximum';
            else params.time_range = JSON.stringify(window);
            const data = await this.fetch(`/${metaCampaignId}/insights`, params);
            return parsePeriodTotalsRow(Array.isArray(data?.data) ? data.data[0] : null);
        } catch (error: any) {
            console.error(`[MetaServerClient] Failed to fetch period totals for campaign ${metaCampaignId}:`, error.message);
            return null;
        }
    }

    /**
     * Totals for several Ads Manager date presets of ONE campaign in a single HTTP round trip
     * (Graph batch API; Meta runs the parts in parallel). Presets use the ad account timezone,
     * exactly like Ads Manager: today, last_7d/14d/30d (full days, excluding today), maximum.
     * A preset whose part failed is missing from the result.
     */
    async getCampaignPresetTotals(metaCampaignId: string, presets: readonly string[]): Promise<Record<string, CampaignPeriodTotals>> {
        const batch = presets.map((p) => ({
            method: 'GET',
            relative_url: `${metaCampaignId}/insights?fields=${encodeURIComponent(PERIOD_TOTALS_FIELDS)}&date_preset=${p}`,
        }));
        const response = await fetch(`${GRAPH_API_URL}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ access_token: this.accessToken, batch: JSON.stringify(batch), include_headers: 'false' }).toString(),
            cache: 'no-store',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const errorObj = new Error(`Meta API Error: ${error.error?.message || 'Unknown error'}`);
            (errorObj as any).metaError = error.error;
            throw errorObj;
        }
        const parts: ({ code: number; body: string } | null)[] = await response.json();
        const out: Record<string, CampaignPeriodTotals> = {};
        presets.forEach((p, i) => {
            const part = parts?.[i];
            if (!part || part.code !== 200) return;
            try {
                const data = JSON.parse(part.body);
                out[p] = parsePeriodTotalsRow(Array.isArray(data?.data) ? data.data[0] : null);
            } catch { /* skip malformed part */ }
        });
        return out;
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
