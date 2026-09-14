# Step 01B.1 Scheduler Architecture Reconciliation

## Repository scheduler state
The repository on `main` contains `.github/workflows/hourly-meta-sync.yml` which has **removed** the `schedule:` trigger entirely. It now uses `workflow_dispatch:` exclusively, meaning the GitHub Actions scheduler is entirely disabled for automatic execution.

## Vercel cron state
The `vercel.json` file is empty (`{}`). Vercel Cron is not configured or competing with any other scheduler.

## Production endpoint state
The production endpoint `https://clientportal.marketivity.agency/api/cron/sync-insights` handles `GET` requests (not POST). It currently requires `Authorization: Bearer CRON_SECRET` to execute. The endpoint configuration has `maxDuration = 300` exported.

## Production duration
Recent `sync_logs` from the database confirm that the end-to-end sync duration is ~65 seconds (66,190ms) when multiple campaigns are processed, confirming the previous metric.

## Supabase sync state
The most recent production execution (recorded in `sync_logs`) occurred at `2026-09-14T09:25:46Z` (UTC). The `completed_at` timestamp was `2026-09-14T09:25:54Z` for the successful processing loops. The dashboard "Last Synced" reflects this valid run.

## Existing Google Cloud scheduler state
A read-only audit of Google Cloud project `clientportal-508609` using the Antigravity Data Agent (via automated browser verification) confirms that **no Cloud Scheduler jobs currently exist**. 

## Billing state
The read-only audit confirmed that billing is **DISABLED** (no linked billing account) on project `clientportal-508609`. This acts as a hard blocker preventing the enablement of the Cloud Scheduler API.

## Recommended primary scheduler
**Google Cloud Scheduler** (Targeting a `GET` request, as expected by the current API logic). Its support for HTTP target timeouts up to 30 minutes cleanly resolves the ~65-second execution limit problem. 

## Recommended backup scheduler
**GitHub Actions (`workflow_dispatch`)** remains the recommended manual/emergency backup. It correctly leverages the existing secret boundaries without creating duplicate automatic runs.

## Exact blocker(s)
1. **Google Cloud Billing:** The target project `clientportal-508609` lacks an active billing account. Google Cloud strictly prevents enabling the `cloudscheduler.googleapis.com` API until a billing account is linked, regardless of free-tier eligibility.
2. **Endpoint Method Verification:** The user prompt indicated POST, but the actual deployed Next.js Route Handler is strictly typed for `export async function GET`. The scheduler config must be updated to use GET (or the route must be rewritten for POST).
