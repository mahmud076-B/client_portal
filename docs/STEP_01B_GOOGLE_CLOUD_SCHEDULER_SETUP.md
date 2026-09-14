# Step 01-B: Google Cloud Scheduler Setup Guide

**Purpose:** Configure Google Cloud Scheduler as the primary, reliable scheduler for the Meta Ads sync endpoint, replacing the unreliable GitHub Actions scheduled trigger.

**Verified production facts this guide is based on:**
- Endpoint: `POST https://clientportal.marketivity.agency/api/cron/sync-insights`
- Auth: `Authorization: Bearer <CRON_SECRET>`
- Measured execution duration: ~65 seconds
- Vercel `maxDuration`: 300 seconds (Fluid Compute)
- cron-job.org: **MUST NOT be used** (30-second request timeout)
- GitHub Actions: Retained as manual/emergency `workflow_dispatch` only

---

## Prerequisites

Before starting, you need:

- A Google account (personal Gmail or Workspace)
- Access to a credit/debit card for Google Cloud billing setup (a small hold may be placed; Cloud Scheduler has a free tier of 3 jobs/month — verify current pricing at https://cloud.google.com/scheduler/pricing)
- The value of your `CRON_SECRET` environment variable (do **not** write it down anywhere; retrieve it from your Vercel dashboard when needed)
- Approximately 30 minutes

---

## Step 1 — Google Cloud Project

### 1.1 Open the Console

1. Open your browser and go to: **https://console.cloud.google.com**
2. Sign in with your Google account.
3. If this is your first visit, you will see a welcome screen. Accept the Terms of Service.

### 1.2 Create a Dedicated Project

> We create a separate project to keep billing and permissions isolated from other Google services you may use.

1. At the top of the page, click the **project selector dropdown** (it shows either your current project name or "Select a project").
2. In the dialog that appears, click **"New Project"** (top-right of the dialog).
3. Fill in:
   - **Project name:** `marketivity-client-portal` (or any clear name you will recognize)
   - **Organization:** Leave as-is (your personal account or org)
   - **Location:** Leave as-is
4. Click **Create**.
5. Wait ~10 seconds. When complete, click **"Select Project"** in the notification, or use the project selector to switch to your new project.

### 1.3 Locate Your Project ID

Your **Project ID** is not the same as the project name. You will need it later.

1. Go to the **Home** page: https://console.cloud.google.com/home
2. Look at the **Project info** card on the right side.
3. Find **Project ID** — it looks like `marketivity-client-portal-123456`.
4. Copy and save this somewhere temporary (it is not secret).

### 1.4 Enable Billing

Cloud Scheduler requires a billing account. You will not be charged during normal operation for 3 or fewer jobs under the free tier, but Google requires a payment method on file.

1. In the left sidebar, navigate to: **Billing** (or go to https://console.cloud.google.com/billing)
2. Link a billing account. If you do not have one, click **Manage Billing Accounts** → **Create Account** and follow the prompts.
3. Return to your project and confirm billing is enabled.

> **Note:** Verify current pricing at https://cloud.google.com/scheduler/pricing before proceeding. Pricing may have changed since this guide was written.

### 1.5 Enable the Cloud Scheduler API

1. In the top search bar, type **"Cloud Scheduler API"** and press Enter.
2. Click on **"Cloud Scheduler API"** in the results.
3. Click **"Enable"**.
4. Wait ~30 seconds for it to activate. You will be redirected automatically.

You may also need to enable the **Secret Manager API** (covered in Step 2). You can enable it now:

1. In the top search bar, type **"Secret Manager API"** and press Enter.
2. Click on **"Secret Manager API"** in the results.
3. Click **"Enable"**.

---

## Step 2 — Secure Storage of CRON_SECRET

### Why This Matters

The production endpoint requires:

```
Authorization: Bearer <CRON_SECRET>
```

Google Cloud Scheduler can include arbitrary HTTP headers when calling your endpoint. However, if you type the secret directly into the Scheduler job form, it will be visible in the Google Cloud Console to anyone with access to the project.

**The recommended approach is Google Cloud Secret Manager**, which stores the secret in an encrypted vault and allows the Scheduler to reference it securely.

> **Important:** As of this writing, Google Cloud Scheduler does **not** natively integrate with Secret Manager for HTTP headers in the basic console flow. The header value you enter in the Scheduler form is stored in the job configuration and visible to project admins. This is acceptable for this use case if:
> - Your Google Cloud project has no other members (single-operator setup)
> - You trust your Google account security (2FA enabled)
>
> If you need stricter isolation, see the **Advanced Alternative** section below.

### 2.1 Basic Approach (Single-Operator, Recommended for This Setup)

You will enter the `Authorization` header value directly in the Scheduler job form in Step 3. The secret will be stored encrypted by Google but visible to project admins.

**Ensure your Google account has 2-factor authentication enabled** before proceeding:
https://myaccount.google.com/security

### 2.2 Advanced Alternative: Secret Manager (Optional)

If you want maximum security or plan to add team members to this Google Cloud project:

1. Go to: https://console.cloud.google.com/security/secret-manager
2. Click **"+ Create Secret"**.
3. **Name:** `marketivity-cron-secret`
4. **Secret value:** Paste the value of your `CRON_SECRET` here (retrieve it from your Vercel dashboard → Project Settings → Environment Variables).
5. Click **"Create Secret"**.
6. The secret is now stored encrypted in Google's vault. **Do not record the value anywhere else.**

To use this secret in Cloud Scheduler, you would need a Cloud Run or Cloud Functions intermediary that reads the secret and calls your endpoint — this is significantly more complex and is not required for a single-operator deployment. The basic approach (Step 2.1) is safe and recommended.

---

## Step 3 — Create the Cloud Scheduler Job

### 3.1 Navigate to Cloud Scheduler

1. In the top search bar, type **"Cloud Scheduler"** and press Enter.
2. Click on **"Cloud Scheduler"** in the results.
3. Click **"Create Job"**.

### 3.2 Configure Job Definition

Fill in the form exactly as follows:

**Name:**
```
marketivity-meta-sync-30min
```

**Region:**
Choose the region closest to you or your users. For Bangladesh, use:
```
asia-south1  (Mumbai)
```
Or use `us-central1` if latency is not a concern. The scheduler region does not affect where Vercel runs.

**Description:**
```
Primary 30-minute scheduler for Meta Ads sync. Calls Vercel production endpoint.
```

**Frequency (cron expression):**
```
*/30 * * * *
```
This runs every 30 minutes, every hour, every day — anchored to UTC. The sync endpoint itself handles Meta account timezone conversion for D0/D1/D2, so UTC scheduling is correct and deterministic.

**Timezone:**
```
Coordinated Universal Time (UTC)
```
> Do **not** use Asia/Dhaka or any local timezone for the scheduler itself. UTC is simpler and eliminates daylight-saving ambiguity. The application code handles account-local date calculation independently.

Click **"Continue"**.

### 3.3 Configure Execution Target

On the next screen:

**Target type:**
```
HTTP
```

**URL:**
```
https://clientportal.marketivity.agency/api/cron/sync-insights
```

**HTTP method:**
```
POST
```

> The route currently handles `GET` (as seen in the route code), but `POST` is the correct and documented method for this endpoint per project requirements. Verify the route handler accepts `POST` if you encounter a 405 error — if so, change to `GET` here.

**HTTP headers:**

Click **"Add a header"** and add:

| Header name | Header value |
|---|---|
| `Authorization` | `Bearer <paste your CRON_SECRET here>` |
| `Content-Type` | `application/json` |

> **NEVER record the CRON_SECRET in this document, screenshots, or chat.** Retrieve it from your Vercel dashboard (Project Settings → Environment Variables → `CRON_SECRET`) at the time you fill in this form, then close the Vercel tab.

**Body (optional):**
Leave blank (the endpoint does not require a request body).

**Auth header:**
Leave the default **"Add OAuth token"** option as **None/No Auth** — your custom `Authorization: Bearer` header handles authentication at the application level.

> If Google pre-populates an OIDC or OAuth option, select **"None"**. Using Google's OIDC token would add a second Authorization header and is not needed here.

Click **"Continue"**.

### 3.4 Configure Attempt Deadline

On the next screen, look for **"Configure optional settings"** and expand it:

**Attempt deadline:**
```
120s
```
This gives the endpoint 120 seconds to respond before Cloud Scheduler considers the attempt failed. The measured production execution is ~65 seconds. 120 seconds provides ~55 seconds of headroom.

> You can increase this up to `1800s` (30 minutes) if you expect future growth. Start conservatively at 120s.

Click **"Continue"** or **"Create"**.

---

## Step 4 — Retry Configuration

Still in the job creation form (under optional settings), configure retries conservatively:

**Maximum retry attempts:**
```
1
```

> Set to 1 (or 0 if you prefer no automatic retries). The application already uses idempotent `upsert` operations on `campaign_insights`, so a retry will not create duplicates. However, setting retries high risks overlapping executions if Vercel is slow.

**Maximum retry duration:**
```
0s
```
(Disables the maximum retry duration window — retries are bounded by the attempt count above.)

**Minimum backoff duration:**
```
5s
```

**Maximum backoff duration:**
```
60s
```

**Max doublings:**
```
2
```

> These settings mean: if the first attempt fails, Cloud Scheduler will try once more after ~5–10 seconds. It will not create retry storms.

Click **"Create"** to finalize the job.

---

## Step 5 — Verify the Authorization Header

Before testing, double-check that your `CRON_SECRET` matches what Vercel has in production.

The production 401 seen in earlier testing revealed a mismatch between the local `.env.local` value and the Vercel production environment. The **Vercel dashboard is the source of truth**.

1. Open: https://vercel.com/dashboard
2. Select your `clientportal` project.
3. Go to **Settings → Environment Variables**.
4. Find `CRON_SECRET`.
5. Note the value (do not copy it to chat, documents, or clipboard longer than necessary).
6. This is the value that must be in your Cloud Scheduler job's `Authorization` header.

If the secret in Vercel differs from what you used in the Scheduler job:
- Go back to Cloud Scheduler → your job → **"Edit"**
- Update the `Authorization` header with the correct value
- Save

---

## Step 6 — Manual Test

After creating the job, test it immediately before waiting for a scheduled run.

### 6.1 Trigger Manually

1. Go to: https://console.cloud.google.com/cloudscheduler
2. Find your job `marketivity-meta-sync-30min`.
3. Click the **"Run now"** button (▶ icon on the right side of the row).
4. Record the exact time you clicked it.

### 6.2 Check Cloud Scheduler Result

1. After ~90 seconds, refresh the Cloud Scheduler page.
2. Look at the **"Last run"** column — it should show a recent timestamp.
3. Look at the **"Last run result"** column — it should show **"Success"** (green).
4. If it shows **"Deadline exceeded"** — increase the attempt deadline (see Troubleshooting).
5. If it shows **"Unauthorized"** — the `CRON_SECRET` header value is wrong.

### 6.3 Verify Vercel Received the Request

1. Open: https://vercel.com/dashboard → your project → **"Logs"** tab.
2. Filter by the function `/api/cron/sync-insights`.
3. Confirm a request arrived at the time you triggered the job.
4. Confirm the log shows a 200 response.
5. Confirm no `FUNCTION_INVOCATION_TIMEOUT` error.

### 6.4 Verify Supabase sync_logs

Check the `sync_logs` table in your Supabase dashboard:

1. Open: https://supabase.com/dashboard → your project → **Table Editor** → `sync_logs`
2. Filter by `started_at` descending.
3. Confirm a new row exists with:
   - `status = 'success'`
   - `started_at` matching the time you triggered the job
   - `completed_at` present
   - `records_synced` ≥ 0
   - `ad_account_id` populated

### 6.5 Verify Dashboard

1. Open: https://clientportal.marketivity.agency
2. Log in.
3. Confirm the **"Last Synced"** timestamp has updated to the time of your manual test.
4. Confirm campaign data is visible and unchanged.

### 6.6 Record Evidence

Fill in the following table after your manual test:

| Field | Observed Value |
|---|---|
| Trigger time | _(fill in)_ |
| Cloud Scheduler result | _(Success / Failed)_ |
| Vercel HTTP status | _(200 / other)_ |
| Actual execution duration | _(fill in seconds)_ |
| sync_logs status | _(success / failed)_ |
| records_synced | _(fill in)_ |
| Dashboard "Last Synced" | _(fill in timestamp)_ |

Do not consider the scheduler verified until all rows are filled and confirmed.

---

## Step 7 — Scheduled Run Verification

After the manual test succeeds:

1. Wait for the next two scheduled automatic executions (the job runs every 30 minutes, so within ~1 hour you should see two runs).
2. After each, check Cloud Scheduler → job row → **"Last run result"**.
3. After both scheduled runs, verify in Supabase `sync_logs` that:
   - Two new success rows exist
   - `started_at` timestamps are approximately 30 minutes apart
   - No duplicate rows in `campaign_insights` for the same `(campaign_id, date)` — the upsert constraint prevents this, but verify
4. Confirm the dashboard **"Last Synced"** reflects the most recent scheduled run.

---

## Step 8 — Monitoring

### Where to See Execution History

**Cloud Scheduler job logs:**
1. Go to: https://console.cloud.google.com/cloudscheduler
2. Click on your job name `marketivity-meta-sync-30min`.
3. Click **"View Logs"** — this opens Cloud Logging filtered to your job.
4. Each row shows: timestamp, execution status, HTTP response code, latency.

**Vercel function logs:**
1. https://vercel.com/dashboard → your project → **Logs**
2. Filter by `/api/cron/sync-insights`
3. Shows: invocation time, duration, status code, console output

**Supabase sync_logs table:**
- The application writes a row for every sync attempt per ad account.
- Filter `status = 'failed'` to see any failed accounts.

### Setting Up Email Alerts (Optional)

To receive email when a Cloud Scheduler job fails:

1. Go to: https://console.cloud.google.com/monitoring/alerting
2. Click **"Create Policy"**
3. Under **Condition**, add a condition on **Cloud Scheduler** metrics → filter on your job name → trigger on failed executions
4. Under **Notification Channels**, add your email address
5. Save

This ensures you are notified if a scheduled run fails without having to manually check.

---

## Step 9 — GitHub Backup Confirmed Retained

The GitHub Actions workflow at `.github/workflows/hourly-meta-sync.yml` is **retained as a manual emergency backup** only.

Current state:
- `workflow_dispatch:` — ✅ KEPT (manual trigger)
- `schedule:` — ✅ REMOVED (no longer used)
- `CRON_SECRET` — accessed via `${{ secrets.CRON_SECRET }}` (GitHub Secrets, not source code)

**Do not add `schedule:` back to this file.** Google Cloud Scheduler is the primary scheduler going forward.

To use the GitHub backup:
1. Go to: https://github.com/mahmud076-B/client_portal/actions/workflows/hourly-meta-sync.yml
2. Click **"Run workflow"** → **"Run workflow"**

---

## Security Notes

| Rule | Status |
|---|---|
| CRON_SECRET never in source code | ✅ Always use environment variables or Google Console form |
| CRON_SECRET never in screenshots | ✅ Redact before sharing |
| CRON_SECRET never in reports or documentation | ✅ Use placeholder `<CRON_SECRET>` |
| CRON_SECRET never in the URL (query string) | ✅ Always in the `Authorization` header only |
| Google Cloud project restricted to minimum members | ✅ Verify under IAM |
| Google account 2FA enabled | ✅ Required — verify at https://myaccount.google.com/security |
| Vercel project 2FA / team access reviewed | ✅ Verify in Vercel dashboard |

---

## Troubleshooting

### Problem: Cloud Scheduler shows "Deadline exceeded"

**Cause:** The Vercel function took longer than the configured attempt deadline.  
**Fix:** Edit the job → increase **Attempt deadline** to `180s`, then `300s` if needed.

### Problem: Cloud Scheduler shows "Unauthorized" (HTTP 401)

**Cause:** The `Authorization` header value does not match the `CRON_SECRET` in Vercel.  
**Fix:**
1. Open Vercel dashboard → your project → Settings → Environment Variables → `CRON_SECRET`
2. Open Cloud Scheduler → edit your job
3. Update the `Authorization` header to `Bearer <correct value from Vercel>`
4. Save and re-run manually to confirm

### Problem: Cloud Scheduler shows "Connection refused" or network error

**Cause:** DNS or Vercel routing issue.  
**Fix:**
- Verify the URL is exactly: `https://clientportal.marketivity.agency/api/cron/sync-insights`
- Test the URL with a browser or curl to confirm it is reachable
- Check Vercel deployment status

### Problem: sync_logs shows "success" but records_synced = 0

**Cause:** This is expected when Meta returns no new data for D0/D1/D2 (i.e., no new activity since the last sync). Not an error.  
**Confirm:** Check `campaign_insights` table directly for rows with today's date.

### Problem: Dashboard "Last Synced" is not updating

**Cause:** The dashboard reads `sync_logs.completed_at` for the most recent successful run. If all runs for a given ad account are failing, it may show an older timestamp.  
**Fix:** Check `sync_logs` for `status = 'failed'` rows and review `error_message`.

### Problem: Duplicate sync_logs rows for the same time window

**Cause:** Cloud Scheduler retry fired a second request while the first was still running.  
**Fix:** Reduce **Maximum retry attempts** to 0, or ensure the **Attempt deadline** is long enough that the first attempt always completes before a retry is considered.

---

## Rollback Procedure

If Google Cloud Scheduler causes unexpected issues:

1. Go to Cloud Scheduler → your job → click **"Pause"** (‖ icon). This stops scheduled executions immediately.
2. Trigger a manual sync via GitHub Actions backup:
   - https://github.com/mahmud076-B/client_portal/actions/workflows/hourly-meta-sync.yml → Run workflow
3. Diagnose the Cloud Scheduler issue using Cloud Logging.
4. Once resolved, return to Cloud Scheduler → **"Resume"** the job.

**Do NOT re-add `schedule:` to the GitHub Actions workflow as a workaround** — this was the original unreliable scheduler that caused the 4–5 hour drift documented in `docs/30_MINUTE_SYNC_ACTUAL_RUN_AUDIT.md`.

---

## Verification Checklist

Use this checklist after completing setup:

- [ ] Google Cloud project created and billing enabled
- [ ] Cloud Scheduler API enabled
- [ ] Secret Manager API enabled (if using advanced approach)
- [ ] Scheduler job created with correct URL, method, header, frequency, deadline
- [ ] Manual "Run now" test completed
- [ ] Cloud Scheduler shows "Success" for manual run
- [ ] Vercel logs confirm request received and 200 returned
- [ ] Vercel execution completed within attempt deadline (no timeout)
- [ ] `sync_logs` contains new success row with correct timestamps
- [ ] Dashboard "Last Synced" updated
- [ ] Two consecutive scheduled runs verified
- [ ] No duplicate `campaign_insights` rows
- [ ] GitHub Actions `workflow_dispatch` confirmed still available as backup
- [ ] Cloud Logging / email alerts configured (optional)
- [ ] Google account 2FA verified
