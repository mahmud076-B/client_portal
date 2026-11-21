/**
 * Objective-aware "Result" resolution for Meta campaigns.
 *
 * Meta's Ads Manager "Results" column is driven by the ad set optimization_goal
 * (falling back to the campaign objective). We reproduce that mapping from the raw
 * insights arrays we store per day (`actions`, `action_values`) so every campaign type
 * shows its own result — messaging, follows/page likes, ThruPlays, purchases, leads, etc.
 *
 * Sources (Graph API v26/v27 reference):
 *  - Campaign.objective enum: OUTCOME_AWARENESS | OUTCOME_ENGAGEMENT | OUTCOME_LEADS | OUTCOME_SALES |
 *    OUTCOME_TRAFFIC | OUTCOME_APP_PROMOTION + legacy (BRAND_AWARENESS, REACH, PAGE_LIKES, POST_ENGAGEMENT,
 *    VIDEO_VIEWS, MESSAGES, LINK_CLICKS, LEAD_GENERATION, CONVERSIONS, PRODUCT_CATALOG_SALES, APP_INSTALLS,
 *    EVENT_RESPONSES, LOCAL_AWARENESS, OFFER_CLAIMS, STORE_VISITS)
 *  - AdSet.optimization_goal enum (THRUPLAY, PAGE_LIKES, CONVERSATIONS, OFFSITE_CONVERSIONS, VALUE,
 *    LEAD_GENERATION, QUALITY_LEAD, LINK_CLICKS, LANDING_PAGE_VIEWS, POST_ENGAGEMENT, REACH, IMPRESSIONS, ...)
 *  - AdsActionStats action_type values used by Ads Manager columns.
 *
 * Pure + isomorphic: safe to import from server and client components.
 */

export type ResultMetric =
    | { kind: 'actions'; types: string[] }   // first action_type present wins (never summed: they overlap)
    | { kind: 'thruplay' }                    // video_thruplays column
    | { kind: 'reach' }                       // de-duplicated period reach
    | { kind: 'impressions' };

export interface ResultSpec {
    key: string;
    label: string;          // e.g. "Follows / Page likes"
    costLabel: string;      // e.g. "Cost per follow"
    metric: ResultMetric;
    /** Purchase campaigns: action_values types for revenue/ROAS. */
    valueTypes?: string[];
    /** Reach/awareness: cost is per 1,000 people (Meta convention). */
    costPerThousand?: boolean;
}

const MESSAGING: ResultSpec = {
    key: 'messaging', label: 'Messaging conversations', costLabel: 'Cost per conversation',
    metric: { kind: 'actions', types: ['onsite_conversion.messaging_conversation_started_7d'] },
};
const FOLLOWS: ResultSpec = {
    key: 'follows', label: 'Follows / Page likes', costLabel: 'Cost per follow',
    // `like` = Page likes/follows ("Page likes" column). Fallbacks cover newer follow action types if Meta returns them.
    metric: { kind: 'actions', types: ['like', 'onsite_conversion.page_follow', 'page_follow', 'follow'] },
};
const THRUPLAY: ResultSpec = { key: 'thruplay', label: 'ThruPlays', costLabel: 'Cost per ThruPlay', metric: { kind: 'thruplay' } };
const VIDEO_3S: ResultSpec = {
    key: 'video_views', label: '3-second video views', costLabel: 'Cost per video view',
    metric: { kind: 'actions', types: ['video_view'] },
};
const POST_ENGAGEMENT: ResultSpec = {
    key: 'post_engagement', label: 'Post engagements', costLabel: 'Cost per engagement',
    metric: { kind: 'actions', types: ['post_engagement'] },
};
const PAGE_ENGAGEMENT: ResultSpec = {
    key: 'page_engagement', label: 'Page engagements', costLabel: 'Cost per engagement',
    metric: { kind: 'actions', types: ['page_engagement', 'post_engagement'] },
};
const LINK_CLICKS: ResultSpec = {
    key: 'link_clicks', label: 'Link clicks', costLabel: 'Cost per link click',
    metric: { kind: 'actions', types: ['link_click'] },
};
const LANDING_PAGE_VIEWS: ResultSpec = {
    key: 'landing_page_views', label: 'Landing page views', costLabel: 'Cost per landing page view',
    metric: { kind: 'actions', types: ['landing_page_view', 'omni_landing_page_view'] },
};
const PURCHASES: ResultSpec = {
    key: 'purchases', label: 'Purchases', costLabel: 'Cost per purchase',
    metric: { kind: 'actions', types: ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase', 'onsite_web_purchase'] },
    valueTypes: ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase', 'onsite_web_purchase'],
};
const LEADS: ResultSpec = {
    key: 'leads', label: 'Leads', costLabel: 'Cost per lead',
    metric: { kind: 'actions', types: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped'] },
};
const APP_INSTALLS: ResultSpec = {
    key: 'app_installs', label: 'App installs', costLabel: 'Cost per install',
    metric: { kind: 'actions', types: ['omni_app_install', 'mobile_app_install', 'app_install'] },
};
const EVENT_RESPONSES: ResultSpec = {
    key: 'event_responses', label: 'Event responses', costLabel: 'Cost per response',
    metric: { kind: 'actions', types: ['rsvp'] },
};
const REACH: ResultSpec = {
    key: 'reach', label: 'People reached', costLabel: 'Cost per 1,000 reached',
    metric: { kind: 'reach' }, costPerThousand: true,
};
const IMPRESSIONS: ResultSpec = {
    key: 'impressions', label: 'Impressions', costLabel: 'CPM',
    metric: { kind: 'impressions' }, costPerThousand: true,
};

const SALES_OBJECTIVES = new Set(['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES', 'WEBSITE_CONVERSIONS']);
const LEAD_OBJECTIVES = new Set(['OUTCOME_LEADS', 'LEAD_GENERATION']);

/** optimization_goal decides the result (as in Ads Manager); objective is the fallback. */
export function resolveResultSpec(objective?: string | null, optimizationGoal?: string | null): ResultSpec | null {
    const obj = (objective || '').toUpperCase();
    switch ((optimizationGoal || '').toUpperCase()) {
        case 'CONVERSATIONS':
        case 'MESSAGING_PURCHASE_CONVERSION':
        case 'MESSAGING_APPOINTMENT_CONVERSION':
        case 'MESSAGING_DEEP_CONVERSATION_AND_FOLLOW':
            return MESSAGING;
        case 'PAGE_LIKES':
            return FOLLOWS;
        case 'THRUPLAY':
            return THRUPLAY;
        case 'POST_ENGAGEMENT':
        case 'ENGAGED_USERS':
            return POST_ENGAGEMENT;
        case 'PROFILE_AND_PAGE_ENGAGEMENT':
            return PAGE_ENGAGEMENT;
        case 'LINK_CLICKS':
            return LINK_CLICKS;
        case 'LANDING_PAGE_VIEWS':
            return LANDING_PAGE_VIEWS;
        case 'LEAD_GENERATION':
        case 'QUALITY_LEAD':
            return LEADS;
        case 'OFFSITE_CONVERSIONS':
        case 'VALUE':
            return LEAD_OBJECTIVES.has(obj) ? LEADS : PURCHASES;
        case 'APP_INSTALLS':
        case 'APP_INSTALLS_AND_OFFSITE_CONVERSIONS':
            return APP_INSTALLS;
        case 'EVENT_RESPONSES':
            return EVENT_RESPONSES;
        case 'REACH':
        case 'AD_RECALL_LIFT':
            return REACH;
        case 'IMPRESSIONS':
            return IMPRESSIONS;
    }

    switch (obj) {
        case 'MESSAGES': return MESSAGING;
        case 'PAGE_LIKES': return FOLLOWS;
        case 'VIDEO_VIEWS': return THRUPLAY;
        case 'POST_ENGAGEMENT':
        case 'OUTCOME_ENGAGEMENT': return POST_ENGAGEMENT;
        case 'LINK_CLICKS':
        case 'OUTCOME_TRAFFIC': return LINK_CLICKS;
        case 'OUTCOME_AWARENESS':
        case 'BRAND_AWARENESS':
        case 'REACH':
        case 'LOCAL_AWARENESS': return REACH;
        case 'APP_INSTALLS':
        case 'OUTCOME_APP_PROMOTION': return APP_INSTALLS;
        case 'EVENT_RESPONSES': return EVENT_RESPONSES;
    }
    if (SALES_OBJECTIVES.has(obj)) return PURCHASES;
    if (LEAD_OBJECTIVES.has(obj)) return LEADS;
    return null;
}

type ActionStat = { action_type?: string; value?: string | number };

const MESSAGING_FALLBACK_OBJECTIVES = new Set(['', 'OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT', 'MESSAGES', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC']);

/**
 * Like resolveResultSpec, but when the ad set optimization_goal is unknown (metadata not
 * synced yet) it looks at the data: a campaign that is producing messaging conversations
 * is a messages campaign, whose Ads Manager result is "Messaging conversations started".
 * Without this, OUTCOME_ENGAGEMENT messages campaigns showed "Post engagements".
 */
export function resolveResultSpecForData(
    objective: string | null | undefined,
    optimizationGoal: string | null | undefined,
    rows: { actions?: unknown; messaging_conversations_started?: number | string | null }[]
): ResultSpec | null {
    const base = resolveResultSpec(objective, optimizationGoal);
    if (optimizationGoal) return base;
    const types = (MESSAGING.metric as { kind: 'actions'; types: string[] }).types;
    const msgs = rows.reduce((sum, r) => {
        const v = firstOf(r.actions, types) ?? (Number(r.messaging_conversations_started) || 0);
        return sum + v;
    }, 0);
    if (msgs > 0 && MESSAGING_FALLBACK_OBJECTIVES.has((objective || '').toUpperCase())) return MESSAGING;
    return base;
}

function actionValue(list: unknown, type: string): number | null {
    if (!Array.isArray(list)) return null;
    const hit = (list as ActionStat[]).find((a) => a?.action_type === type);
    if (!hit) return null;
    const n = Number(hit.value);
    return Number.isFinite(n) ? n : null;
}

/** Per row: value of the first action type (priority order) present. Overlapping types are never summed. */
function firstOf(list: unknown, types: string[]): number | null {
    for (const t of types) {
        const v = actionValue(list, t);
        if (v !== null) return v;
    }
    return null;
}

export interface InsightRow {
    date: string;
    spend?: number | string | null;
    impressions?: number | string | null;
    reach?: number | string | null;
    actions?: unknown;
    action_values?: unknown;
    video_thruplays?: number | string | null;
    messaging_conversations_started?: number | string | null;
}

export interface ComputedResult {
    spec: ResultSpec;
    total: number | null;           // null = not available (e.g. data synced before this feature)
    costPerResult: number | null;
    daily: { date: string; value: number }[];
    purchaseValue?: number | null;
    roas?: number | null;
    /** true when rows predate raw-action storage and the metric cannot be computed yet. */
    pendingResync?: boolean;
}

export function computeResult(
    spec: ResultSpec,
    rows: InsightRow[],
    opts: { totalSpend: number; periodReach?: number | null; totalImpressions?: number }
): ComputedResult {
    const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
    let daily: { date: string; value: number }[] = [];
    let total: number | null = 0;
    let pendingResync = false;

    const m = spec.metric;
    if (m.kind === 'reach') {
        daily = rows.map((r) => ({ date: r.date, value: num(r.reach) }));
        total = opts.periodReach ?? null; // daily reach is not additive; only the de-duplicated period reach is valid
    } else if (m.kind === 'impressions') {
        daily = rows.map((r) => ({ date: r.date, value: num(r.impressions) }));
        total = opts.totalImpressions ?? daily.reduce((s, d) => s + d.value, 0);
    } else if (m.kind === 'thruplay') {
        const has = rows.some((r) => r.video_thruplays !== null && r.video_thruplays !== undefined);
        if (!has && rows.length > 0) pendingResync = true;
        daily = rows.map((r) => ({ date: r.date, value: num(r.video_thruplays) }));
        total = daily.reduce((s, d) => s + d.value, 0);
    } else {
        const hasRaw = rows.some((r) => Array.isArray(r.actions));
        if (spec.key === 'messaging' && !hasRaw) {
            // Legacy rows: the dedicated column already holds this metric.
            daily = rows.map((r) => ({ date: r.date, value: num(r.messaging_conversations_started) }));
        } else {
            if (!hasRaw && rows.length > 0) pendingResync = true;
            daily = rows.map((r) => ({ date: r.date, value: firstOf(r.actions, m.types) ?? 0 }));
        }
        total = daily.reduce((s, d) => s + d.value, 0);
    }

    if (pendingResync) total = null;

    let costPerResult: number | null = null;
    if (total && total > 0 && opts.totalSpend > 0) {
        costPerResult = spec.costPerThousand ? (opts.totalSpend / total) * 1000 : opts.totalSpend / total;
    }

    const out: ComputedResult = { spec, total, costPerResult, daily, pendingResync };
    if (spec.valueTypes) {
        const vals = rows.map((r) => firstOf(r.action_values, spec.valueTypes!));
        const value = vals.some((v) => v !== null) ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
        out.purchaseValue = value;
        out.roas = value !== null && opts.totalSpend > 0 ? value / opts.totalSpend : null;
    }
    return out;
}

/* ───────────────────────── Delivery status ───────────────────────── */

export type DeliveryTone = 'green' | 'amber' | 'gray' | 'red' | 'blue' | 'ink';
/** Coarse machine-readable status used by events/AI (one source of truth with the UI label). */
export type DerivedStatus = 'ACTIVE' | 'SCHEDULED' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'DELETED' | 'IN_REVIEW' | 'REJECTED' | 'OTHER';
export interface DeliveryStatus { key: string; code: DerivedStatus; label: string; tone: DeliveryTone; description: string; isLive: boolean }

/**
 * Human delivery status, like Ads Manager's "Delivery" column.
 * Meta keeps effective_status = ACTIVE after a campaign's stop_time passes, so "Completed"
 * must be derived from end_time (campaign stop_time = merge of its ad sets' end times).
 */
export function deriveDeliveryStatus(
    c: { status?: string | null; effective_status?: string | null; end_time?: string | null; start_time?: string | null },
    now: Date = new Date()
): DeliveryStatus {
    const eff = (c.effective_status || c.status || '').toUpperCase();
    const ended = !!c.end_time && new Date(c.end_time).getTime() <= now.getTime();
    const notStarted = !!c.start_time && new Date(c.start_time).getTime() > now.getTime();

    switch (eff) {
        case 'DELETED': return { key: 'deleted', code: 'DELETED', label: 'Deleted', tone: 'gray', description: 'This campaign was deleted in Meta.', isLive: false };
        case 'ARCHIVED': return { key: 'archived', code: 'ARCHIVED', label: 'Archived', tone: 'gray', description: 'This campaign is archived.', isLive: false };
        case 'DISAPPROVED': return { key: 'disapproved', code: 'REJECTED', label: 'Rejected', tone: 'red', description: 'Meta rejected one or more ads. Your account team is on it.', isLive: false };
        case 'WITH_ISSUES': return { key: 'issues', code: 'REJECTED', label: 'Has issues', tone: 'red', description: 'Meta reported a delivery issue. Your account team is reviewing it.', isLive: false };
    }
    if (ended && eff !== 'PAUSED') {
        return { key: 'completed', code: 'COMPLETED', label: 'Completed', tone: 'ink', description: `Finished on ${new Date(c.end_time!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`, isLive: false };
    }
    switch (eff) {
        case 'ACTIVE':
            return notStarted
                ? { key: 'scheduled', code: 'SCHEDULED', label: 'Scheduled', tone: 'blue', description: 'This campaign will start soon.', isLive: false }
                : { key: 'active', code: 'ACTIVE', label: 'Active', tone: 'green', description: 'Your campaign is live and delivering.', isLive: true };
        case 'PAUSED':
        case 'CAMPAIGN_PAUSED':
            return { key: 'paused', code: 'PAUSED', label: 'Paused', tone: 'amber', description: 'Delivery is paused.', isLive: false };
        case 'ADSET_PAUSED':
            return { key: 'paused', code: 'PAUSED', label: 'Ad sets paused', tone: 'amber', description: 'All ad sets are paused.', isLive: false };
        case 'IN_PROCESS':
            return { key: 'processing', code: 'IN_REVIEW', label: 'Processing', tone: 'blue', description: 'Meta is applying recent changes.', isLive: false };
        case 'PENDING_REVIEW':
        case 'PREAPPROVED':
            return { key: 'review', code: 'IN_REVIEW', label: 'In review', tone: 'blue', description: 'Meta is reviewing the ads.', isLive: false };
        case 'PENDING_BILLING_INFO':
            return { key: 'billing', code: 'OTHER', label: 'Billing needed', tone: 'red', description: 'Delivery is waiting on billing.', isLive: false };
    }
    return { key: 'unknown', code: 'OTHER', label: eff ? eff.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (s) => s.toUpperCase()) : 'Unknown', tone: 'gray', description: 'Status synced from Meta.', isLive: false };
}

/** Friendly objective name for display. */
export function objectiveLabel(objective?: string | null, optimizationGoal?: string | null): string {
    // The ad set goal is more specific than the ODAX objective (e.g. Engagement -> Followers).
    const goal = (optimizationGoal || '').toUpperCase();
    if (goal === 'PAGE_LIKES') return 'Followers';
    if (goal === 'THRUPLAY') return 'Video views';
    if (goal === 'CONVERSATIONS' || goal.startsWith('MESSAGING_')) return 'Messages';
    if (!objective) return 'Not set';
    const map: Record<string, string> = {
        OUTCOME_AWARENESS: 'Awareness', OUTCOME_ENGAGEMENT: 'Engagement', OUTCOME_LEADS: 'Leads',
        OUTCOME_SALES: 'Sales', OUTCOME_TRAFFIC: 'Traffic', OUTCOME_APP_PROMOTION: 'App promotion',
        MESSAGES: 'Messages', PAGE_LIKES: 'Page likes', VIDEO_VIEWS: 'Video views', POST_ENGAGEMENT: 'Post engagement',
        LINK_CLICKS: 'Traffic', LEAD_GENERATION: 'Lead generation', CONVERSIONS: 'Conversions', BRAND_AWARENESS: 'Brand awareness',
        REACH: 'Reach', PRODUCT_CATALOG_SALES: 'Catalog sales', APP_INSTALLS: 'App installs', EVENT_RESPONSES: 'Event responses',
    };
    return map[objective.toUpperCase()] || objective.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (s) => s.toUpperCase());
}
