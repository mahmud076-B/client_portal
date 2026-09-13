# Meta Marketing API Architecture

This document describes the foundation for connecting Marketivity to the Meta Marketing API, securely handling authentication, and storing credentials.

## Future Steps (Step 07+)
In subsequent steps, Marketivity will synchronize performance insights (spend, clicks, leads, etc.) into the `campaigns` and `sync_logs` tables using the saved connection tokens.

---

## Step 06 — Campaign Discovery & Client Assignment

**API Version**: `v26.0` (Updated verified standard as of Sept 2026)

**Required Permissions**: `ads_read`

**Server-Side Flow**:
1. Admin selects a registered Ad Account and clicks "Discover Campaigns".
2. Next.js Server Action (`discoverCampaigns`) validates that the requested Ad Account actually belongs to the authenticated user's organization.
3. Server decrypts the Meta access token from `meta_connections` using `AES-256-GCM`.
4. Server calls `GET /v26.0/act_<AD_ACCOUNT_ID>/campaigns?fields=id,name,status,effective_status,objective,buying_type,account_id`.
5. Server normalizes the response, stripping raw data and access tokens before returning it to the browser.

**Registration & Assignment Flow**:
- **Register**: Admin selects a campaign to track. The `registerCampaign` Server Action *re-fetches* the campaign directly from Meta to definitively prove it belongs to the Ad Account. The campaign is then inserted into the `campaigns` table.
- **Assign**: Admin selects an organization client from a dropdown to assign the campaign to. The `assignCampaign` Server Action validates that the authenticated Admin, the Client, and the Campaign all definitively belong to the exact same `organization_id` before inserting the link into `campaign_assignments`.

**Database RLS Security (Mutation Enforcement)**:
Because Supabase defaults to DENY, `INSERT`, `UPDATE`, and `DELETE` policies have been explicitly crafted for `ad_accounts`, `campaigns`, and `campaign_assignments`. These policies perform hard database-level checks ensuring that an Admin can only mutate rows that map back to their own `public.get_auth_org_id()`. Clients cannot mutate these tables at all. This guarantees absolute zero-trust tenant isolation, protecting the system even if a malicious payload bypassed application-layer checks.

## 2. Permissions Required
To read insights, ad accounts, and campaigns without modifying client campaigns, we request:
- `ads_read`: Read access to ads, campaigns, and ad accounts.
- `read_insights`: Read access to ad performance data (reach, impressions, spend).

## 3. OAuth 2.0 Flow Architecture
The OAuth flow uses the **Server-Side Authorization Code Flow** to ensure tokens are never exposed to the browser.

1. **Initiation**: Admin clicks "Connect Meta". The Next.js server (`/api/meta/connect`) generates a secure, random CSRF `state` and stores it in an `HttpOnly` secure cookie. The server redirects the user to the Meta OAuth dialog.
2. **Authorization**: The user logs in to Facebook and approves the permissions for the Marketivity Meta App.
3. **Callback**: Meta redirects the user to `/api/meta/callback` with a `code` and the `state`.
4. **Validation**: The server verifies the `state` matches the cookie.
5. **Exchange**: The server makes a backend API call to `graph.facebook.com/v19.0/oauth/access_token` exchanging the `code` for a **Short-Lived User Access Token**.
6. **Upgrade**: The server immediately exchanges the short-lived token for a **Long-Lived User Access Token** (valid for ~60 days).
7. **Storage**: The server encrypts the long-lived token using AES-256-GCM and persists it to the PostgreSQL `meta_connections` table.

## 4. Credential Storage Security Model (AES-256-GCM)
Because we are working in a multi-tenant environment, exposing Meta tokens is a critical security vulnerability. 

Instead of plaintext storage, tokens are encrypted **Application-Side** in Next.js before being written to PostgreSQL.
- **Algorithm**: `AES-256-GCM` (Authenticated Encryption with Associated Data).
- **Key**: A 32-byte (256-bit) server-only secret `META_ENCRYPTION_KEY` injected via environment variables.
- **Components**: The IV (Initialization Vector), the Encrypted Token, and the Auth Tag are stored in the database.
- **Guarantee**: Even if the entire PostgreSQL database is dumped or leaked, the tokens remain cryptographically secure because the encryption key remains strictly inside the Next.js process boundary.

## 5. Server/Client Boundary
- **Never** expose `META_APP_SECRET` to the client (no `NEXT_PUBLIC_` prefix).
- **Never** expose `META_ENCRYPTION_KEY` to the client.
- **Never** expose the raw access token in API responses.
- The UI strictly displays the *Connection Status* (e.g., Connected, Expired).

## 6. Meta Developer App Configuration Checklist
When setting up the real Meta Developer App, the following is required:
1. **App Type**: Business
2. **Products**: Add "Facebook Login for Business" or "Marketing API".
3. **Valid OAuth Redirect URIs**: Must exactly match the production URL (e.g., `https://portal.marketivity.com/api/meta/callback`) and local testing (e.g., `http://localhost:3000/api/meta/callback`).
4. **App Review**: To access client ad accounts (not owned by the Business Manager), the App must pass App Review for `ads_read` and `read_insights`.
5. **Mode**: App must be in "Live" mode to function for real clients.

## 7. Placeholder Configuration
In development, use placeholders in `.env.local`:
```
META_APP_ID=<your-app-id>
META_APP_SECRET=<server-only-secret>
META_ENCRYPTION_KEY=<32-byte-hex-string>
```
