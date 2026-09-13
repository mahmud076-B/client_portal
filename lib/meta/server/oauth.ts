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
        scope: 'ads_read',
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
export async function getLongLivedToken(shortLivedToken: string): Promise<string> {
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
    return data.access_token;
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
