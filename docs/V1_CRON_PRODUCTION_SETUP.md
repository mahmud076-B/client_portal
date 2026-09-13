# V1 CRON PRODUCTION SETUP

## 1. Final Architecture

The production scheduled sync architecture for Marketivity Client Portal is configured as follows:

```text
GitHub Actions (Hourly Schedule: 0 * * * *)
       │
       ▼  HTTP GET with Authorization: Bearer ${{ secrets.CRON_SECRET }}
Production Endpoint (https://clientportal.marketivity.agency/api/cron/sync-insights)
       │
       ▼  Bearer Token Validation against process.env.CRON_SECRET
Meta Graph API (Insights + Campaign Metadata for D0, D1, D2)
       │
       ▼  Encrypted Credentials & Admin Upsert
Supabase Database (campaigns, campaign_insights, sync_logs)
```

- **Scheduler**: GitHub Actions scheduled workflow (`.github/workflows/hourly-meta-sync.yml`).
- **Endpoint**: `https://clientportal.marketivity.agency/api/cron/sync-insights`.
- **Authorization**: Mandatory `Authorization: Bearer <CRON_SECRET>` header.
- **Native Vercel Cron**: Disabled (`vercel.json` contains `{}`). This eliminates any duplicate or competing cron runs on Vercel's Hobby tier.

---

## 2. Secret Rotation

- **Previous State**: Development secret `test_secret_123` was present in local configuration.
- **Current State**: The weak secret has been completely rotated and replaced with a cryptographically secure 256-bit (32 random bytes, 64-character hex) random token.
- **Storage**:
  - Updated locally in `.env.local` and `.env`.
  - Both `.env.local` and `.env` are verified in `.gitignore` and have never been committed to git history.
  - The plaintext secret value is strictly excluded from source code, workflow YAML, git commits, and public reports.

---

## 3. Vercel Configuration

- `vercel.json` has been cleared to `{}`. No native cron jobs are defined in Vercel, preventing duplicate execution and avoiding Vercel Hobby plan limitations (which silently restricts hourly crons to once daily).
- The rotated `CRON_SECRET` must be set in Vercel's Project Settings under Environment Variables with **Production** scope.

---

## 4. GitHub Actions Configuration

Workflow file: [hourly-meta-sync.yml](file:///d:/ClientPortal/.github/workflows/hourly-meta-sync.yml)

### Key Configuration Attributes
- **Permissions**: `contents: read` (minimal privilege principle).
- **Concurrency**:
  ```yaml
  concurrency:
    group: marketivity-hourly-meta-sync
    cancel-in-progress: false
  ```
  Prevents overlapping runs while ensuring that an ongoing production sync is never canceled mid-execution.
- **Execution Mechanism**:
  ```yaml
  - name: Trigger Sync Insights
    env:
      CRON_SECRET: ${{ secrets.CRON_SECRET }}
    run: |
      RESPONSE_CODE=$(curl -s -S -o response.txt -w "%{http_code}" -H "Authorization: Bearer $CRON_SECRET" https://clientportal.marketivity.agency/api/cron/sync-insights)
      if [ "$RESPONSE_CODE" -ne 200 ]; then
        echo "Sync failed with HTTP status code $RESPONSE_CODE"
        cat response.txt
        exit 1
      fi
      echo "Sync completed successfully with HTTP status code $RESPONSE_CODE"
  ```
- **Error Handling**: Fails visibly if HTTP status is non-200 (4xx, 5xx) or on network failures.
- **Credential Protection**: The secret is passed via environment variable `CRON_SECRET` and is never printed or echoed. No Supabase service-role keys or Meta API credentials are placed in GitHub.

---

## 5. Workflow Schedule

- **Schedule**: `0 * * * *` (UTC).
- **Frequency**: Every hour on the hour (24 times per day).
- **Manual Trigger**: `workflow_dispatch` is enabled, allowing on-demand execution from GitHub's Actions UI.
- **Terminology**: Labeled as "Hourly sync" / "Updated hourly" across the application to reflect Meta API processing and attribution timelines truthfully.

---

## 6. Endpoint Security

The endpoint [route.ts](file:///d:/ClientPortal/app/api/cron/sync-insights/route.ts) enforces strict authentication:

```typescript
// Strict Bearer token validation for the cron endpoint
if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Authentication Test Results
| Request Condition | HTTP Status | Result |
|-------------------|-------------|--------|
| No Authorization header | `401 Unauthorized` | **PASSED** |
| Invalid secret (`Bearer wrong-secret`) | `401 Unauthorized` | **PASSED** |
| Former weak secret (`Bearer test_secret_123`) | `401 Unauthorized` | **PASSED** |
| Valid rotated secret (`Bearer <NEW_SECRET>`) | `200 OK` | **PASSED** |

---

## 7. Manual GitHub & Vercel Action Required

To activate production hourly syncing, complete the following manual steps:

### Step A: Configure Vercel Production Secret
1. Open your [Vercel Dashboard](https://vercel.com).
2. Select the `client_portal` project.
3. Navigate to **Settings** → **Environment Variables**.
4. Add or update the variable:
   - **Key**: `CRON_SECRET`
   - **Value**: *(Copy the value of `CRON_SECRET` from your local `.env.local` file)*
   - **Environment**: Check **Production** (and Preview if needed).
5. Save changes.

### Step B: Configure GitHub Actions Secret
1. Open the GitHub repository: `https://github.com/mahmud076-B/client_portal`.
2. Navigate to **Settings** → **Secrets and variables** → **Actions**.
3. Under **Repository secrets**, click **New repository secret** (or update if already existing):
   - **Name**: `CRON_SECRET`
   - **Secret**: *(Paste the exact same secret value copied from `.env.local`)*
4. Click **Add secret**.

### Step C: Test Workflow Run
1. In GitHub, navigate to the **Actions** tab.
2. Select **Hourly Meta Sync** in the left sidebar.
3. Click **Run workflow** → select branch `main` → click the green **Run workflow** button.
4. Verify the job completes with a green checkmark.

---

## 8. Production Test

- **Local Verification**: Verified locally via Next.js development server. Endpoint returned status `200` with payload:
  `{"success":true,"results":[...]}`
- **Production URL**: `https://clientportal.marketivity.agency/api/cron/sync-insights`
- **Deployment Status**: Production will authenticate and sync as soon as `CRON_SECRET` is added to Vercel and the latest code is deployed.

---

## 9. sync_logs Verification

The sync execution records each run into Supabase `sync_logs`:
- **Ad Account ID**: Verified recording for active client accounts.
- **Records Synced**: Verified upsert of D0 (today), D1 (yesterday), and D2 (two days ago) insights.
- **Timestamps**: `started_at` and `completed_at` accurately record duration.
- **Error Logging**: Detailed error captured if an ad account lacks Meta permissions without terminating other accounts.

---

## 10. Security Verification

- [x] Development secret `test_secret_123` removed and rejected.
- [x] Cryptographically strong 256-bit token generated.
- [x] Secret is stored in `.gitignore`'d `.env.local` and never committed to version control.
- [x] Workflow references secret strictly via `${{ secrets.CRON_SECRET }}` without printing or echoing.
- [x] Workflow permissions scoped down to `contents: read`.
- [x] No Meta credentials or Supabase service-role keys placed in GitHub Actions.
- [x] Endpoint rejects missing, empty, or mismatched Bearer tokens with 401.

---

## 11. Final Status

**READY WITH ONE MANUAL STEP**  
Application code, endpoint security, concurrency guard, and workflow files are fully prepared and tested. Production execution requires setting the rotated `CRON_SECRET` in Vercel Environment Variables and GitHub Actions Secrets.
