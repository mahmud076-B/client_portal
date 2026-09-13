# STEP 09 ARCHITECTURE PROPOSAL: Meta Insights Sync & Automation

## 1. Exact Meta Insights endpoint(s) required
We will query the Insights API at the Ad Account level, grouping by campaign, to minimize API calls and avoid rate limits.
- **Endpoint**: `GET /{META_API_VERSION}/act_{ad_account_id}/insights`
- **Parameters**: 
  - `level=campaign`
  - `fields=campaign_id,impressions,spend,clicks,cpc,cpm,ctr,reach,date_start,date_stop`
  - `time_preset=maximum` (or `date_preset=lifetime`) for lifetime metrics, or specific `time_ranges` for historical daily data.

*Note: The current codebase sets `META_GRAPH_API_VERSION = 'v26.0'`, which does not exist (Meta is currently around v21.0). This must be downgraded to a valid production version (e.g., `v21.0`).*

## 2. Exact permissions required
- `ads_read`: This is already requested in `lib/meta/server/oauth.ts` and is sufficient for querying Ads Insights. 
- *(Note: `read_insights` is only required for Page/Instagram organic insights, not Ads Manager insights).*

## 3. Required database fields/tables
We need to store:
- `impressions` (integer)
- `spend` (numeric)
- `clicks` (integer)
- `reach` (integer)
- `cpc`, `cpm`, `ctr` (numeric - optional, can be derived, but storing Meta's exact values prevents calculation discrepancies).
- `date_start`, `date_stop` (for time-series data).

## 4. Whether the existing campaigns table is sufficient
**No, it is not sufficient for time-series or cleanly separated metric data.** 
The `campaigns` table is designed for structural entity data (name, status, budget). Constantly updating it with fluctuating daily/lifetime metrics would cause write-contention, bloat the table, and destroy historical tracking capabilities.

## 5. Whether a dedicated campaign_insights table is necessary
**Yes, a dedicated `campaign_insights` table is highly recommended.**
```sql
CREATE TABLE public.campaign_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL, -- The date these metrics represent (or 'lifetime' indicator)
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    spend NUMERIC(12,2) DEFAULT 0,
    reach INTEGER DEFAULT 0,
    cpc NUMERIC(12,2),
    cpm NUMERIC(12,2),
    ctr NUMERIC(8,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(campaign_id, date) -- Idempotency key
);
```

## 6. Sync frequency recommendation
- **Active Campaigns**: Sync every 6 to 12 hours via a Cron Job (e.g., Vercel Cron or a triggered serverless function).
- **Completed Campaigns**: Sync once a week or freeze them after 7 days of inactivity.

## 7. Idempotency strategy
- Use `UNIQUE(campaign_id, date)` on the `campaign_insights` table.
- Upsert (ON CONFLICT) during sync: if the data for a specific date (or lifetime) already exists, update the metrics; otherwise, insert. This allows safe, repeated cron executions.

## 8. Retry strategy
- Wrap the Meta API call in a `try/catch` with an exponential backoff (e.g., 3 retries: 2s, 4s, 8s).
- If the sync fails after retries, log the failure in the existing `sync_logs` table (`status = 'failed'`, `error_message = <reason>`) and do NOT crash the entire cron job (continue to the next ad account).

## 9. Pagination strategy
- Meta Insights API returns data in paginated format using cursor-based pagination (`paging.cursors.after` and `paging.next`).
- The fetch logic in `MetaServerClient` must include a `while` loop that follows the `paging.next` URL until all pages of campaign insights for the ad account are consumed.

## 10. Rate-limit handling
- Check the `x-business-use-case-usage` or `x-app-usage` HTTP response headers.
- If usage exceeds 85-90%, sleep/delay the script or elegantly abort the current sync loop, logging the rate limit in `sync_logs` to resume later.

## 11. Token-expiry handling
- We currently exchange for a long-lived token (~60 days) in `oauth.ts`.
- If the API returns a token expiration error (e.g., OAuthException code 190), we must flag the `meta_connections` table (or equivalent) as `status = 'expired'` and alert the Admin to re-authenticate. The sync loop should gracefully skip this account.

## 12. Multi-tenant security model
- **Sync Phase**: The sync runs via a secure API route protected by a secret CRON_KEY. It uses the `SUPABASE_SERVICE_ROLE_KEY` to read tokens, fetch data, and bypass RLS to write to `campaign_insights` and `sync_logs`.
- **Client Read Phase**: The `campaign_insights` table must have an RLS policy mirroring `campaigns`. Clients can only `SELECT` insights where `campaign_id` is assigned to them via `campaign_assignments` and matches their `organization_id`.

## 13. Historical data strategy
- **Initial Sync**: Fetch `time_preset=lifetime` or `time_preset=maximum` for an aggregate overview.
- **Daily Granularity**: (Optional but recommended) Fetch `time_increment=1` for the last 30 days during the first sync to populate historical charts, then fetch `date_preset=yesterday` on subsequent daily crons.

## 14. How client dashboards will consume the synced data
- A Server Component in the dashboard will query `public.campaign_insights` filtered by the client's assigned campaigns.
- Data will be aggregated (e.g., `SUM(spend)`) for top-level KPIs.
- Data grouped by `date` will be passed to a Recharts (or similar) frontend component to render historical trend lines.

## 15. Exact files that will be created/modified
- **Created**: `supabase/migrations/0007_campaign_insights.sql` (Creates table and RLS).
- **Created**: `app/api/cron/sync-insights/route.ts` (Cron endpoint).
- **Modified**: `lib/meta/server/client.ts` (Fix API version to `v21.0`, add `getCampaignInsights` with pagination).
- **Modified**: `app/dashboard/DashboardClient.tsx` (Wire up real metrics instead of hardcoded UI placeholders).
- **Modified**: `app/dashboard/admin/clients/page.tsx` (Show real aggregated spend/metrics per client).

## 16. Any required environment variables
- `CRON_SECRET`: Required to securely invoke `/api/cron/sync-insights` from Vercel Cron or external triggers.

## 17. Migration requirements
- Run `0007_campaign_insights.sql` to create the new table.
- Apply `SELECT` RLS policies for admins and clients on the new table.

## 18. Verification/test plan
1. Execute migration and verify table structure and RLS.
2. Manually trigger the cron endpoint via POST/GET with `CRON_SECRET`.
3. Verify `sync_logs` records a successful run.
4. Verify `campaign_insights` is populated with real metrics from the connected Ad Account.
5. Re-run the endpoint and verify idempotency (rows updated, not duplicated).
6. Log in as a Client and verify the dashboard aggregates the correct numbers without seeing other tenants' data.

---

**STEP 09 ARCHITECTURE: NEEDS REVISION / PENDING APPROVAL**
(Waiting for user approval before implementing).
