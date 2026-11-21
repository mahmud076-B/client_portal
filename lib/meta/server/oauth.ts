import { encryptToken } from './crypto';

const API_VERSION = 'v26.0';
const FACEBOOK_OAUTH_URL = `https://www.facebook.com/${API_VERSION}/dialog/oauth`;
const GRAPH_API_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Generates the Facebook OAuth URL.
 */
export function getOAuthUrl(redirectUri: string, state: string): string {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error('META_APP_ID is not configured');

    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        state: state,
        scope: 'ads_read,business_management',
        response_type: 'code',
    });

    return `${FACEBOOK_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges the OAuth authorization code for a short-lived access token.
 */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
        throw new Error('META_APP_ID or META_APP_SECRET is not configured');
    }

    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        client_secret: appSecret,
        code: code,
    });

    const url = `${GRAPH_API_URL}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to exchange code: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Upgrades a short-lived token to a long-lived token (~60 days).
 */
export async function getLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string; expiresAt: string | null }> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
        throw new Error('META_APP_ID or META_APP_SECRET is not configured');
    }

    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
    });

    const url = `${GRAPH_API_URL}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get long-lived token: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    // Long-lived user tokens last ~60 days; Meta returns expires_in (seconds).
    const expiresAt = typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;
    return { accessToken: data.access_token, expiresAt };
}

/**
 * Retrieves the Meta User ID for the given access token.
 */
export async function getMetaUserId(accessToken: string): Promise<string> {
    const params = new URLSearchParams({
        access_token: accessToken,
        fields: 'id',
    });
    
    const url = `${GRAPH_API_URL}/me?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to fetch Meta User ID: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.id;
}

export interface InspectedToken {
    metaUserId: string;
    name: string | null;
    /** ISO timestamp, or null when the token never expires (System User token with expires_at = 0). */
    expiresAt: string | null;
    scopes: string[] | null;
}

/**
 * Validates a manually supplied access token (e.g. a Meta Business System User token).
 *
 * SECURITY: the token is only sent to Meta (Graph API). It is never logged, and errors
 * thrown here never include it.
 */
export async function inspectAccessToken(accessToken: string): Promise<InspectedToken> {
    // 1. Who does this token belong to? (Works for user and system-user tokens.)
    const meRes = await fetch(`${GRAPH_API_URL}/me?fields=id,name`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
    });
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me?.id) {
        throw new Error(me?.error?.message || 'Meta rejected this token.');
    }

    // 2. Expiry + scopes via debug_token (needs app credentials; optional if not configured).
    let expiresAt: string | null = null;
    let scopes: string[] | null = null;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (appId && appSecret) {
        const params = new URLSearchParams({ input_token: accessToken });
        const dbgRes = await fetch(`${GRAPH_API_URL}/debug_token?${params.toString()}`, {
            headers: { Authorization: `Bearer ${appId}|${appSecret}` },
            cache: 'no-store',
        });
        const dbg = await dbgRes.json().catch(() => ({}));
        const info = dbg?.data;
        if (!dbgRes.ok || !info) {
            throw new Error(dbg?.error?.message || 'Could not inspect token with debug_token.');
        }
        if (info.is_valid === false) {
            throw new Error(info.error?.message || 'Meta reports this token is invalid.');
        }
        // expires_at = 0 means the token never expires.
        if (typeof info.expires_at === 'number' && info.expires_at > 0) {
            expiresAt = new Date(info.expires_at * 1000).toISOString();
        }
        scopes = Array.isArray(info.scopes) ? info.scopes : null;
    }

    return { metaUserId: String(me.id), name: me.name ?? null, expiresAt, scopes };
}
