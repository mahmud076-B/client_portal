# PHASE 3.2 — META CAMPAIGN INSIGHTS API CLIENT
**Status:** PASS
**Date:** 2026-09-13

## Objective
Implement a production-safe server-side Meta Campaign Insights client, fetch campaign-level daily insights, normalize the response, validate campaign ownership, and persist data idempotently into the existing `campaign_insights` table.

## Implementation Details

### 1. Meta API Client Architecture
We isolated the insights synchronization logic out of the generic `MetaServerClient` into a specialized class, `MetaInsightsClient` located at `lib/meta/server/insights.ts`.

*   **API Version:** `v26.0` (validated against Meta Developer Docs)
*   **Endpoint Used:** `GET /v26.0/{ad_account_id}/insights`
*   **Query Parameters:**
    *   `level=campaign`
    *   `time_increment=1`
    *   `time_range={'since':'YYYY-MM-DD','until':'YYYY-MM-DD'}`
    *   `fields=campaign_id,impressions,clicks,spend,reach,cpc,cpm,ctr`
*   **Pagination:** Implemented a robust loop to fetch `paging.next` cursors, capped at 50 pages.
*   **Normalization:** Type casting was enforced (e.g., converting strings like `'0.0'` to floats via `parseFloat`, and strings like `'42'` to integers via `parseInt(..., 10)`) protecting Postgres constraints.

### 2. Cron Upsert Logic & Database Alignment
The sync logic in `app/api/cron/sync-insights/route.ts` was refactored:

*   **Idempotency & Constraints:**
    The upsert command correctly utilizes the database constraints: `UNIQUE (campaign_id, date)`.
    ```typescript
    await supabase.from('campaign_insights').upsert(insightsPayload, { 
        onConflict: 'campaign_id,date',
        ignoreDuplicates: false // Updates existing rows with fresh data
    });
    ```
*   **Tenant Ownership Validation (CRITICAL):**
    Insights fetched from Meta are strictly verified before insertion. We retrieve the internal `campaign.id` via `meta_campaign_id` joined to the verified `ad_account.id`. Any API data for a campaign we do not locally own is ignored, making spoofing impossible.
*   **Relationship Fix:** Resolved a critical schema mapping issue where the backend attempted to embed `ad_accounts` inside `meta_connections` without a direct foreign key. We split this into independent queries against `organization_id` matching which successfully resolved the "Could not find a relationship" exception.

### 3. Token Error Handling & Security
*   **Security:** Tokens are securely decrypted entirely server-side using the `META_ENCRYPTION_KEY`.
*   **Invalidation Logic:** Modified `MetaServerClient` to propagate the raw Meta JSON response payload upwards via a generic `MetaAPIError`. The cron layer parses this payload:
    ```typescript
    if (metaError && metaError.code === 190) {
        connectionHasTokenError = true;
    }
    ```
    If `code === 190` (Token Expired / OAuth Error), the code breaks iteration to avoid rate-limiting lockouts, although it currently allows the daily sync to just log failures without aggressively mutating connection statuses unless required.
*   **Error Tolerance:** One disconnected ad-account/connection failure does not halt the entire global sync.

### 4. Verification Check
- **Dashboard Integrity:** **Zero** files related to the frontend Dashboard presentation or visual UI components were modified.
- **End-to-End Success:** We verified real integration idempotently by manually triggering the cron fetch spanning to "maximum" date_preset for an active campaign. `sync_logs` demonstrated `{ "status": "success", "records": 4 }`, successfully persisting rows to `campaign_insights` without triggering PG constraints. 

## Next Steps
Proceeding to Phase 3.3 for exposing this new normalized `campaign_insights` dataset directly into the React Client Dashboard and calculating trends/recommendations.
