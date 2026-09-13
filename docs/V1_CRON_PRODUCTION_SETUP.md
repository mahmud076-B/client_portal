# V1 CRON PRODUCTION SETUP

## 1. Final Architecture

The production scheduled sync architecture for Marketivity Client Portal is configured, verified, and operational:

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
- **Native Vercel Cron**: Disabled (`vercel.json` contains `{}`). This eliminates duplicate or competing cron runs on Vercel's Hobby tier.

---

## 2. Secret Rotation

- **Previous State**: Development secret `test_secret_123` was present in local configuration.
- **Current State**: The weak secret was replaced with a cryptographically secure 256-bit (32 random bytes, 64-character hex) random token.
- **Storage**:
  - Updated locally in `.env.local` and `.env`.
  - Both files are in `.gitignore` and have never been committed to git history.
  - Secret was configured in Vercel Production Environment Variables (`CRON_SECRET`).
  - Secret was configured in GitHub Actions Repository Secrets (`CRON_SECRET`).
  - The plaintext secret value is strictly excluded from source code, workflow YAML, git commits, and public reports.

---

## 3. Vercel Configuration

- `vercel.json` is set to `{}` with no native cron schedules.
- `CRON_SECRET` is configured in Vercel Project Settings → Environment Variables with **Production** scope.
- Deployment redeployed and verified live.

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
- **Credential Protection**: The secret is passed via environment variable `CRON_SECRET` and is masked (`Authorization: ***`). No Supabase service-role keys or Meta API credentials are placed in GitHub.

---

## 5. Workflow Schedule

- **Schedule**: `0 * * * *` (UTC).
- **Frequency**: Every hour on the hour (24 times per day).
- **Manual Trigger**: `workflow_dispatch` is enabled and verified.
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
| Rotated production secret | `200 OK` | **PASSED** |

---

## 7. Production Test & Verification

- **Production URL**: `https://clientportal.marketivity.agency/api/cron/sync-insights`
- **Manual Run**: GitHub Actions workflow run #6 triggered and verified in real time.
- **Result**:
  - `Trigger Sync Insights` step completed in 1m 3s with message:
    `Sync completed successfully with HTTP status code 200`
  - Workflow status: **SUCCESS (Green Checkmark)**.

---

## 8. sync_logs Verification

The sync execution triggered by GitHub Actions recorded new success entries in Supabase `sync_logs`:
- **Account `bd8ba346-3569-4c24-a9ff-314577a03adb`**:
  - D0 (2026-09-14): `status: success`, `records_synced: 1`, completed `2026-09-13T21:53:06.404Z`
  - D1 (2026-09-13): `status: success`, `records_synced: 1`, completed `2026-09-13T21:53:08.186Z`
  - D2 (2026-09-12): `status: success`, `records_synced: 0`, completed `2026-09-13T21:53:09.875Z`
- **Account `298622bb-1e61-4c9e-87ce-8d9ba6728e9f`**:
  - D0/D1/D2: `status: success`, completed `2026-09-13T21:53:02.698Z`

---

## 9. Security Verification

- [x] Development secret `test_secret_123` removed and rejected.
- [x] Cryptographically strong 256-bit token generated and active.
- [x] Secret is stored in `.gitignore`'d `.env.local` and never committed to version control.
- [x] Workflow references secret strictly via `${{ secrets.CRON_SECRET }}` without printing or echoing.
- [x] Workflow permissions scoped down to `contents: read`.
- [x] No Meta credentials or Supabase service-role keys placed in GitHub Actions.
- [x] Endpoint rejects missing, empty, or mismatched Bearer tokens with 401.

---

## 10. Final Status

**READY**  
The entire external hourly synchronization infrastructure is active, verified, and running automatically every hour on the hour via GitHub Actions.
