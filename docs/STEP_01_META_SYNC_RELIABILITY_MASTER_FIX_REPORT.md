# Meta Sync Reliability Master Fix - Step 01 Report

## Executive Summary
This report documents the completion of **Step 01: Core Ingestion Stabilized** of the Meta Sync Reliability Master Fix. We have replaced the brittle schedule dependencies with a more deterministic architecture, implemented full pagination for edge-cases across campaigns and ad-sets, and corrected a major timezone logical vulnerability.

## Implemented Fixes

### 1. GitHub Actions Backup Scheduler
- **Location:** `.github/workflows/hourly-meta-sync.yml`
- **Change:** Removed the `schedule:` trigger block.
- **Result:** The GitHub Actions workflow is now exclusively a manual/emergency backup trigger via `workflow_dispatch`. It will no longer conflict with or delay the primary sync schedule.

### 2. Timezone Fix (Deterministic Calendar Arithmetic)
- **Location:** `app/api/cron/sync-insights/route.ts`
- **Change:** Removed `new Date().toLocaleString()` logic. Replaced with `Intl.DateTimeFormat` configured specifically for the target ad account's timezone to extract the canonical YYYY-MM-DD representing "today" (D0). Subsequent dates (D1, D2) are calculated via UTC calendar math.
- **Result:** D0, D1, and D2 now deterministically represent the ad account's local calendar dates. This resolves DST rollover issues, server timezone bleed, and midnight truncation bugs. Validated via deterministic unit tests.

### 3. Campaign API Pagination
- **Location:** `lib/meta/server/client.ts` (`getCampaigns`)
- **Change:** Added standard cursor-based pagination loop checking `responseData.paging.next`.
- **Result:** Can now safely fetch accounts with >500 campaigns without dropping data.

### 4. ABO Ad Set Pagination & Optimization
- **Location:** `app/api/cron/sync-insights/route.ts`
- **Change:** Ad sets for ABO campaigns are now fetched fully for the entire account using pagination up-front when needed, rather than fetching blindly or dropping records.
- **Result:** Eliminates the "invisible budget" bug for ABO campaigns where ad sets span multiple pages.

## Next Steps for the User (Action Required)

### 1. Configure cron-job.org (Primary Scheduler)
To guarantee the script runs strictly every 30 minutes, you must configure an external cron provider as Vercel Hobby/Pro cron limits do not provide exact 30-minute high-fidelity guarantees without potential dropping.

**Setup Instructions for cron-job.org:**
1. Create a job pointing to `https://clientportal.marketivity.agency/api/cron/sync-insights`
2. Schedule: Every 30 minutes.
3. Method: `POST` (or `GET` based on your implementation, currently `GET`)
4. Headers: Add `Authorization: Bearer <YOUR_CRON_SECRET>`
5. Timeout constraint: Allow up to 300 seconds if possible.

### 2. Verify Vercel maxDuration
The route is currently exporting `export const maxDuration = 300;`.
- **If on Vercel Hobby plan:** The execution is hard-capped at 10-60 seconds regardless of the export. This will cause timeouts if you have many clients.
- **If on Vercel Pro plan:** The 300-second execution will be honored.

**Action:** Monitor your Vercel Logs during the next sync to verify it does not hit a `FUNCTION_INVOCATION_TIMEOUT` limit. If it does, you must upgrade to Pro or implement background chunking.

### 3. Deploy & Real Production Test
1. Commit these changes and push to main.
2. Vercel will deploy.
3. Trigger a manual sync via the UI or `curl` to verify end-to-end logging in the `sync_logs` table.
