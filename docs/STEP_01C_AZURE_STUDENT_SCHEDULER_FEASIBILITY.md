# STEP 01C — Azure Student Scheduler Feasibility Report

## 1. Executive Verdict
**PASS**
Microsoft Azure (via the GitHub Student Developer Pack) is highly suitable to replace Google Cloud Scheduler for the Marketivity Meta Ads auto-sync system. Specifically, an **Azure Function (Timer Trigger) on the Consumption Plan** provides a secure, zero-cost, and robust serverless architecture that natively supports the ~65-second execution time, configurable timeouts up to 10 minutes, and secure secret injection.

## 2. Azure Service Comparison

| Azure Service | Suitable? | Runtime Limit | Cost Profile (Student) | Reason |
|---|---|---|---|---|
| **Azure Functions (Consumption)** | **YES** | 10 minutes | Free (1M executions/mo) | Perfect fit. Code-driven outbound HTTP, long timeouts, secure App Settings. |
| **Azure Logic Apps** | NO | 120 seconds | Very Low | Inbound/Outbound synchronous HTTP is hard-capped at 2 minutes. Risks timeout as sync duration grows. |
| **Azure Automation** | NO | N/A | Exceeds free tier | Free tier is 500 job minutes/mo. 1,440 runs x 1 minute = ~1,440 minutes, causing credit burn. |
| **App Service / WebJobs** | NO | Unbounded | Requires paid tier | Scheduled WebJobs require the "Always On" feature, which is not available in the Free (F1) tier. |
| **Container Apps Jobs** | NO | Unbounded | Free tier available | Overkill. Requires building, maintaining, and storing a Docker image for a simple HTTP call. |

## 3. Recommended Service
**Azure Functions (Consumption Plan) using Node.js / TypeScript.**
A simple Timer-Triggered Azure Function executing every 30 minutes. It uses native `fetch` to call the Vercel production endpoint and handles response logging securely.

## 4. Architecture Diagram

```text
[ Azure Cloud (Student Subscription) ]
       |
       |-- (Every 30 minutes - Timer Trigger)
       |
       v
[ Azure Function App (Consumption Plan) ]
       |
       |-- Reads encrypted App Setting (CRON_SECRET)
       |-- Adds header: Authorization: Bearer <CRON_SECRET>
       |
       v
[ Vercel Production Environment ]
       |-- GET /api/cron/sync-insights
       |-- maxDuration = 300 seconds
       |
       v
[ Meta Graph API & Supabase ]
```

## 5. Authentication Design
**Option 1 (Chosen): Azure Function calls the existing GET endpoint with securely stored CRON_SECRET.**

- **Security:** High. The secret never leaves the Azure backend and Vercel boundary.
- **Implementation Complexity:** Low. The Vercel code does not change.
- **Operational Reliability:** High. Azure Functions handle HTTP authorization headers natively.
- **Production Changes:** **ZERO**. No changes required to Vercel application code. GitHub Actions emergency fallback remains functionally identical.

*(Option 2 and 3 involving Azure OIDC/Managed Identity were rejected because Vercel/Next.js would require custom JWT validation logic, weakening the currently verified boundary and forcing production code changes.)*

## 6. Secret-Storage Design
**Azure App Settings (Environment Variables)**
Under the Azure Student offer, standard Azure App Settings are natively encrypted at rest and injected into the Function App memory at runtime. The `CRON_SECRET` will be placed directly into the Function App's configuration via the Azure Portal. It will never be committed to source code or printed in logs. 
*(Azure Key Vault is supported, but unnecessary overhead for a single secret. App Settings provide sufficient production-grade security).*

## 7. Timeout/Runtime Validation
- **Current Sync Duration:** ~65 seconds.
- **Vercel maxDuration:** 300 seconds (5 minutes).
- **Azure Function Consumption Limit:** 5 minutes default (configurable up to 10 minutes in `host.json`).
- **Validation:** The Azure Function `fetch` request will be configured with a 290-second timeout. This perfectly aligns with Vercel's limits and provides immense headroom above the current 65-second baseline without hitting arbitrary 120-second platform caps (like Logic Apps).

## 8. Retry Behavior
- **Configuration:** Handled via Azure Functions `host.json` `fixedDelay` retry policy.
- **Policy:** Maximum of 1 retry, with a 30-second delay.
- **Impact:** Prevents aggressive retry storms. Idempotency is preserved because the Supabase `campaign_insights` table uses `upsert`.

## 9. Cost / Student-Credit Analysis
- **Azure Student Offer:** $100 free credit, NO credit card required. Hard spending cap protects against accidental billing.
- **Azure Functions Consumption Free Grant:** 1,000,000 executions and 400,000 GB-s of compute per month.
- **Estimated Workload:** 48 executions/day = ~1,440 executions/month.
- **Compute Used:** 1,440 runs * (approx 0.128 GB memory * 70 seconds) = ~12,900 GB-s.
- **Cost:** **$0.00**. This workload consumes barely 1% of the monthly free grant. It will not drain the $100 credit.

## 10. Risks
- **Cold Starts:** Consumption plan functions experience "cold starts" (taking a few extra seconds to boot). This is completely irrelevant here, as it's a background timer job, not a user-facing API.
- **Subscription Expiry:** After 12 months, the student status must be reverified on GitHub, or the resources will be paused.

## 11. Required Code Changes
**None.** The Marketivity Client Portal repository remains exactly as it is.

## 12. Required Azure Resources
1. **Resource Group** (Logical container)
2. **Storage Account** (Required by Azure Functions to store state/logs)
3. **Function App** (Consumption Plan, Node.js runtime)

## 13. Exact Implementation Sequence for STEP 01D
1. Login to Azure Portal using GitHub Student account.
2. Create Function App (Node.js).
3. Add `CRON_SECRET` to App Settings securely via the Portal UI.
4. Deploy a single `timerTrigger` function (via VS Code Azure extension or inline portal editor).
5. Add the `fetch` script with the 290s timeout.
6. Trigger manually and verify Supabase `sync_logs`.
7. Wait for 2 automated runs.

## 14. Why Google Cloud Scheduler is Not Being Used
Google Cloud strictly blocks the enablement of the Cloud Scheduler API (`cloudscheduler.googleapis.com`) on projects that do not have an active billing account linked (credit/debit card). The client portal project `clientportal-508609` triggered a hard billing blocker. Azure for Students circumvents this by providing a verified billing-free environment with native serverless capabilities.

## 15. Final Verdict
**PASS** 
Azure Functions provides a secure, free, and highly compatible scheduling architecture that requires zero modifications to the existing production application.
