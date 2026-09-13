# REACH TOTAL IMPLEMENTATION REPORT

## 1. Problem
Previously, the KPI card displayed "Avg Daily Reach" calculated by averaging daily reach entries across the selected date range (`totalDailyReach / countOfDays`). While mathematically distinct from a direct SUM, averaging daily reach diluted the metric and did not fulfill the product requirement for **Total Reach**—which represents the total number of unique individual accounts reached across the entire reporting window.

---

## 2. Why Avg Daily Reach Was Insufficient
Daily reach represents unique people reached within a single 24-hour period. 
- Summing daily reach causes multi-counting when the same user sees an ad on multiple days (e.g. 6,599 gross vs 6,535 unique).
- Averaging daily reach (e.g. 3,300) represents daily velocity, not total campaign penetration or cumulative unique audience reach over 7, 14, 30 days, or Maximum.
- The business requirement demands **Total Reach**: the true deduplicated unique count of people reached during the selected window.

---

## 3. Final Meta Range-Level Reach Architecture
To achieve 100% semantic correctness without inventing data or performing flawed aggregations, the dashboard now queries Meta Graph API directly on the server side:

```text
DashboardPage (Server Component)
      │
      ▼  Resolve Account Timezone & Date Boundaries (since, until)
MetaServerClient.getCampaignPeriodReach(metaCampaignId, { since, until })
      │
      ▼  GET /v26.0/{campaign_id}/insights?fields=reach&time_range={since,until}
Meta Graph API
      │
      ▼  Returns Period-Level Deduplicated Reach
DashboardClient (renders KPI Card: "Total Reach")
```

- **Execution**: Server-side only via `MetaServerClient`. The client browser never contacts Meta directly and never sees the access token.
- **Deduplication**: Handled natively by Meta's audience attribution engine across the exact query window.
- **Database**: Preserves existing `campaign_insights` daily granularity without adding synthetic aggregate columns.

---

## 4. Range-Specific Query Logic

### Today
- **Window**: `since: today, until: today` in the ad account's timezone (`Asia/Dhaka`).
- **Result**: Unique people reached today.

### 7d
- **Window**: `since: today - 7 days, until: today`.
- **Result**: Unique deduplicated people reached across the 7-day window.

### 14d
- **Window**: `since: today - 14 days, until: today`.
- **Result**: Unique deduplicated people reached across the 14-day window.

### 30d
- **Window**: `since: today - 30 days, until: today`.
- **Result**: Unique deduplicated people reached across the 30-day window.

### Maximum
- **Window**: Bounded strictly to the stored historical data range:
  - `since`: Earliest stored date in `campaign_insights` for this campaign (`insightsData[0].date`).
  - `until`: Latest stored date in `campaign_insights` for this campaign (`insightsData[insightsData.length - 1].date`).
- **Guard**: Prevents unbounded lifetime queries while accurately reflecting cumulative reach for the tracked history.

---

## 5. Multi-Campaign Behavior
The dashboard operates on a per-campaign selection model. If multiple campaigns are queried or if no single campaign is selected, the system does **not** sum campaign-level reach values (as audiences overlap across campaigns). In any multi-campaign scenario where true combined deduplication cannot be performed, the dashboard renders `N/A`.

---

## 6. Error Handling
If the Meta API call fails (network timeout, rate limit, or invalid token):
- The server logs the error safely via `console.error`.
- `periodReach` resolves to `null`.
- The UI renders `N/A` instead of falling back to `SUM` or `AVG`.
- No raw error stacks or tokens are exposed to the client.

---

## 7. Security
- Token decryption occurs strictly in memory on the server inside `MetaServerClient`.
- Decrypted tokens are never serialized, sent via props, or exposed to the browser.
- Uses existing AES-256-GCM architecture with `META_ENCRYPTION_KEY`.

---

## 8. Real Meta vs Dashboard Validation (Campaign: Lifestyle Ad)

| Range | Stored Dates | Meta Period Reach | Stored Daily SUM | Stored Daily AVG | Dashboard Total Reach | Match |
|-------|--------------|-------------------|------------------|------------------|-----------------------|-------|
| **Today** | 2026-09-14 - 2026-09-14 | **650** | 643 | 643 | **650** | **PASS** |
| **7d** | 2026-09-07 - 2026-09-14 | **6,535** | 6,599 | 3,300 | **6,535** | **PASS** |
| **14d** | 2026-08-31 - 2026-09-14 | **6,535** | 6,599 | 3,300 | **6,535** | **PASS** |
| **30d** | 2026-08-15 - 2026-09-14 | **6,535** | 6,599 | 3,300 | **6,535** | **PASS** |
| **Maximum** | 2026-09-13 - 2026-09-14 | **6,535** | 6,599 | 3,300 | **6,535** | **PASS** |

*Notice: Stored Daily SUM (6,599) overcounts by 64 users who saw the ad on multiple days. Meta Period Reach (6,535) accurately deduplicates these impressions. Dashboard Total Reach matches Meta Period Reach exactly.*

---

## 9. Build Result
- `next build` completed with exit code 0.
- Zero TypeScript errors.
- Zero linting errors.

---

## 10. Known Limitations
- Maximum range is bounded by available stored history in Supabase, adhering strictly to non-unbounded query rules.
- Historical data prior to account connection is not backfilled beyond sync windows.
