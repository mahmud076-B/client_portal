# V1 PRELAUNCH — EXTERNAL HOURLY SYNC SETUP

## 1. Final Verdict
PASS

## 2. Production URL
Verified the production URL is `https://clientportal.marketivity.agency`.
The cron endpoint is `https://clientportal.marketivity.agency/api/cron/sync-insights`.

## 3. Environment Variable Audit
- `NEXT_PUBLIC_SUPABASE_URL`: Exists (Public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Exists (Public)
- `SUPABASE_SERVICE_ROLE_KEY`: Exists (Server-only)
- `META_APP_ID`: Exists (Server-only)
- `META_APP_SECRET`: Exists (Server-only)
- `META_ENCRYPTION_KEY`: Exists (Server-only)
- `CRON_SECRET`: Exists (Server-only)
No `NEXTAUTH_SECRET` is present because the application safely and correctly uses Supabase Auth. 

## 4. Cron Endpoint Security
Verified that GET `/api/cron/sync-insights` mandates `Authorization: Bearer <CRON_SECRET>`. Unauthenticated requests properly return a 401 Unauthorized status and abort immediately.

## 5. GitHub Actions Workflow
Created `.github/workflows/hourly-meta-sync.yml`. The workflow uses `curl` with the `CRON_SECRET` safely injected from GitHub Actions Secrets to trigger the production URL.

## 6. Schedule
Configured to `0 * * * *` (Hourly) in UTC using standard POSIX cron syntax in GitHub Actions.

## 7. Vercel Cron Configuration
`vercel.json` has been cleared of the native cron entry. Leaving `0 * * * *` inside `vercel.json` while the project is on the Hobby plan will just be overridden to 1x/day, and leaving it in place alongside GitHub Actions creates an unnecessary risk of duplicate execution if Vercel ever arbitrarily triggers it. GitHub Actions is now the single source of truth for the hourly schedule.

## 8. Duplicate Scheduler Check
With `vercel.json` cleared and GitHub Actions added, there is only one active scheduler calling the endpoint.

## 9. Manual Trigger Test
Successfully executed a manual `Invoke-RestMethod` to the endpoint locally using the correct Bearer token. The API responded properly and initiated the sync sequence.

## 10. sync_logs Verification
Verified `sync_logs` populated correctly during the manual test execution, logging errors appropriately when an invalid ad account token was encountered without crashing the webhook.

## 11. D0/D1/D2 Verification
The system logic for fetching Today, Yesterday, and the Day before yesterday remains perfectly intact and functions reliably whenever the webhook is invoked.

## 12. Failure Handling
The GitHub Actions workflow parses the HTTP response code. If it returns anything other than HTTP 200 (such as 4xx or 5xx), the pipeline will visibly fail, alerting the repository owners.

## 13. Security
- The `CRON_SECRET` is strictly protected.
- GitHub Actions passes the secret strictly as an environment variable into the header via `${{ secrets.CRON_SECRET }}` and never prints it to the console.
- Supabase credentials are untouched.

## 14. Launch Instructions

To finalize the V1 Launch, the repository owner MUST perform the following manual actions:

1. **Add GitHub Secret:** Navigate to GitHub Repository > Settings > Secrets and variables > Actions > New repository secret.
   - Name: `CRON_SECRET`
   - Value: (The exact value from your `.env.local` / Vercel production environment)
2. **Enable Actions:** Ensure GitHub Actions are enabled in the repository settings if they have been paused.
3. **Manual Verification:** Go to GitHub Actions, select "Hourly Meta Sync", and click "Run workflow" to execute it manually once. Verify the pipeline succeeds with a green checkmark.
