# PHASE 3.0 — META CAMPAIGN INSIGHTS SYNC FOUNDATION AUDIT

## 1. Executive Summary
This report summarizes the forensic audit of the Marketivity Client Portal's Meta Campaign Insights Sync architecture. The foundational components (OAuth, RLS, encrypted token storage, discovery, and assignment) were previously built across Steps 04–06. This audit verifies their live state and isolates blockers preventing a successful production insights sync.

**Final Verdict**: **PASS WITH REQUIRED CHANGES**
The core security and data ownership model is highly robust. However, several critical schema mismatches between the live database and the cron logic will cause absolute failure if executed today.

## 2. Current Architecture
- **Tech Stack**: Next.js App Router, Supabase Auth, PostgreSQL, Server-Side OAuth.
- **Security**: AES-256-GCM encrypted long-lived Meta tokens. Server Actions enforce Zero-Trust validation against `organization_id`.
- **Sync Flow**: `app/api/cron/sync-insights/route.ts` runs as a scheduled CRON job utilizing a service-role bypass, fetching data for all authorized organizations.

## 3. Live DB Findings
A live script probe of the database (via Service Role) yielded:
- `meta_connections`: Exists. (Contains `status` field)
- `ad_accounts`: Exists.
- `campaigns`: Exists.
- `campaign_assignments`: Exists.
- `sync_logs`: Exists, but is currently empty.
- **`campaign_insights`**: **MISSING**. The table does not exist in the live schema cache, despite the migration file `20260912192340_campaign_insights.sql` existing in the repository.

## 4. `meta_connections` State Contract
There is a critical, conflicting contract regarding connection state:
- **Database Schema**: Defaults to `'active'`.
- **OAuth Callback (`app/api/meta/callback/route.ts`)**: Upserts with `status: 'connected'`.
- **Admin UI**: Ignores the `status` column entirely and considers the session active if the row exists.
- **Cron Sync (`app/api/cron/sync-insights/route.ts`)**: Queries `.eq('status', 'active')`.
*Consequence*: The cron job will pull zero connections because all newly authenticated users are saved as `'connected'`, whereas the cron searches for `'active'`.

## 5. Campaign Data Flow
The flow `Organization -> Meta Connection -> Ad Account -> Campaign -> Client Assignment` is structurally sound. Admin server actions strictly enforce transitive ownership using nested RLS queries or explicit `organization_id` matching before any mutation.

## 6. `campaign_insights` Schema Assessment
The unapplied migration `20260912192340_campaign_insights.sql` provides:
`id`, `campaign_id`, `date`, `impressions`, `clicks`, `spend`, `reach`, `cpc`, `cpm`, `ctr`.
This schema perfectly satisfies both Meta's standard payload format and the current Next.js Client Dashboard's requirements. 

## 7. `sync_logs` Schema Assessment
There is a fatal schema mismatch for the logging system:
- **Live DB Schema**: Defined in `0000_initial_schema.sql` with columns `records_synced` and `started_at`/`completed_at`.
- **Cron Logic**: Attempts to insert `sync_type` and `records_processed`.
*Consequence*: The cron job will immediately crash with a 500 error when it attempts to write to columns that do not exist.

## 8. Cron / Sync Assessment
- **Entrypoint**: `/api/cron/sync-insights/route.ts`
- **Security**: Protected by a `CRON_SECRET` Bearer token.
- **Token Decryption**: Securely handles AES-256-GCM.
- **Error Handling**: Uses `try/catch` per ad account, meaning a failure in Org A will not halt Org B.
- **Idempotency**: Utilizes `.upsert` with `onConflict: 'campaign_id,date'`, preventing duplicate data injection on cron retries.

## 9. Current Official Meta API Version
- Based on `STEP-06.md` verification, the current target graph API is **v26.0**.
- **Mismatch Identified**: `oauth.ts` uses `v26.0`, but `client.ts` hardcodes `v21.0`.

## 10. Verified Insights Endpoint
- The endpoint used in the cron logic is `/act_<ID>/insights?date_preset=lifetime`.
- Required fields requested match the `campaign_insights` schema design.

## 11. Verified Required Meta Fields
The cron correctly requires `impressions`, `clicks`, `spend`, `reach`, `cpc`, `cpm`, `ctr`. (Depending on Meta API deprecations, exact metric availability must be tested during implementation).

## 12. Token / Security Assessment
- **Status**: Secure.
- The `META_ENCRYPTION_KEY` never leaves the server.
- The browser never receives access tokens.
- Cross-tenant leakage is strictly prevented via RLS.

## 13. Dashboard Hardcoded-Data Inventory
Located in `app/dashboard/DashboardClient.tsx`:
- **LIVE DATABASE**: Client Name/Profile Initials.
- **HARDCODED DEMO**: Amount Spent (`$4.00 (demo)`), Daily Budget (`$5.00 / day`), Started (`Sep 1, 2025`), Objective (`Messaging Conversations`), Campaign Name suffix (`— Messages`), Status (`Active`), Platform (`Facebook, Instagram`).

## 14. Exact Blockers for Production Insights Sync
1. `campaign_insights` table has not been applied to the live PostgreSQL database.
2. `sync_logs` schema mismatch will crash the cron execution.
3. `meta_connections` status mismatch will cause the cron to skip all valid accounts.
4. `client.ts` is running an outdated Meta API version (`v21.0`).

## 15. Minimal Recommended Migration / Code Changes
- **DB**: Apply `20260912192340_campaign_insights.sql` to the production database.
- **DB**: Alter `sync_logs` to rename `records_synced` to `records_processed`, add `sync_type` (TEXT), and remove `started_at`/`completed_at` (if relying on `created_at`). Or vice-versa, update the cron logic to match the existing DB schema.
- **Code**: Align `app/api/cron/sync-insights/route.ts` and `app/api/meta/callback/route.ts` to both use `'connected'`.
- **Code**: Update `client.ts` to `v26.0`.

## 16. Proposed Phase 3 Implementation Sequence
1. Apply missing DB migrations (`campaign_insights`, `sync_logs` fix).
2. Align `status` strings and `client.ts` API versions.
3. Perform a dry-run of the sync-insights cron endpoint using a test service role token.
4. Replace hardcoded demo values in `DashboardClient.tsx` with live data fetched from Supabase.

## 17. Security Risks
- Currently zero. Implementation risks are minimal because the sync job is read-only against the Meta API.

## 18. Performance / Rate-Limit Considerations
- A sequential `for...of` loop over every single ad account across all organizations will eventually timeout Vercel's 300s limit as Marketivity scales. 
- *Future Recommendation*: Implement pagination or a batch queue (e.g., Inngest or Supabase Edge Functions / Queues) for parallel execution.

---
**END OF REPORT**
