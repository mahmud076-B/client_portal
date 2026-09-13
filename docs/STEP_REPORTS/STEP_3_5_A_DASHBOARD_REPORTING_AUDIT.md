# STEP 3.5-A — CLIENT DASHBOARD + META REPORTING GAP AUDIT
**Date:** September 14, 2026
**Mode:** AUDIT ONLY — No code changes made

---

## 1. EXECUTIVE SUMMARY

The Marketivity Client Portal has a working V1 foundation:
- Supabase/PostgreSQL database with RLS
- Meta Marketing API OAuth connection
- Daily cron-based insights sync (spend, impressions, clicks, reach, CPC, CPM, CTR)
- Client-facing dashboard displaying KPI cards and a Chart.js performance chart

**However, the following critical gaps exist for a complete V1:**
1. Messaging conversations started and cost-per-conversation are NOT stored, NOT synced, and NOT displayed
2. Campaign metadata (daily budget, lifetime budget, start/end dates) is partially stored but NOT refreshed after initial discovery
3. "Maximum" date range is NOT implemented in the UI or data layer
4. "Today" range is NOT implemented
5. Sync freshness is once-daily; data can be up to 24 hours stale
6. Last-synced timestamp is NOT shown to clients
7. The `clicks` field may not represent "link clicks" — it is the top-level `clicks` field from Meta which counts all ad interactions, not link-specific clicks
8. Effective status is stored for some campaigns but not consistently synced
9. Lifetime budget is NOT stored in the schema and NOT fetched from Meta

---

## 2. CURRENT ARCHITECTURE FINDINGS

### Technology Stack (confirmed)
- **Framework:** Next.js 16.3.5 (Turbopack, App Router)
- **Database:** Supabase/PostgreSQL (hosted)
- **Auth:** Supabase Auth with cookie-based SSR sessions
- **RLS:** Fully implemented with helper functions (get_auth_role, get_auth_client_id, get_auth_org_id)
- **Meta API:** v26.0 Graph API, server-side only, AES-256-GCM encrypted token storage
- **Hosting:** Vercel (with cron support via vercel.json)
- **Charts:** Chart.js/auto

### Current Data Flow
```
Meta API → /api/cron/sync-insights → campaign_insights table → page.tsx (server) → DashboardClient (client)
```

### Cron Schedule
- Schedule: `0 8 * * *` (UTC 08:00 = daily once)
- Window: D-1 and D-2 per ad account timezone
- Endpoint: GET /api/cron/sync-insights
- Auth: Bearer token (CRON_SECRET)
- Timeout: maxDuration = 300 seconds (Vercel limit)
- Retries: Up to 3, exponential backoff
- Failure handling: Token errors (code 190) disconnect meta_connection; 4xx errors break retry loop; logs all outcomes to sync_logs

---

## 3. CURRENT DASHBOARD INVENTORY

| Feature | Exists | Partial | Missing | Current Source |
|---------|--------|---------|---------|----------------|
| Spend / Amount spent | ✅ | | | campaign_insights.spend, aggregated server-side |
| Impressions | ✅ | | | campaign_insights.impressions, aggregated |
| Reach (Avg Daily) | ✅ | | | campaign_insights.reach, AVG aggregated |
| Clicks (top-level) | ✅ | | | campaign_insights.clicks — WARNING: may not be link clicks |
| CTR | ✅ | | | Calculated: (clicks/impressions)*100 |
| CPC | ✅ | | | Calculated: spend/clicks |
| CPM | ✅ | | | Calculated: (spend/impressions)*1000 |
| Messaging conversations started | | | ❌ | Not fetched, not stored, not displayed |
| Cost per messaging conversation | | | ❌ | Not fetched, not stored, not displayed |
| Campaign status | ✅ | | | campaigns.status (from DB, not refreshed) |
| Effective status | | ✅ | | campaigns.effective_status — NULL for most campaigns |
| Daily budget | | ✅ | | campaigns.daily_budget — NULL for most campaigns |
| Lifetime/total budget | | | ❌ | Not in schema, not fetched |
| Start date | | ✅ | | campaigns.start_time — NULL for all current campaigns |
| End date | | ✅ | | campaigns.end_time — NULL for all current campaigns |
| 7d range | ✅ | | | URL param: ?days=7 |
| 14d range | ✅ | | | URL param: ?days=14 |
| 30d range | ✅ | | | URL param: ?days=30 |
| "Maximum" range | | | ❌ | Not implemented |
| "Today" range | | | ❌ | Not implemented (no ?days=0 or ?range=today) |
| Historical chart | ✅ | | | Chart.js line chart from insights array |
| Last synced timestamp | | | ❌ | Not shown to client (sync_logs exist but not exposed) |
| Sync status indicator | | ✅ | | Static "Updated recently" text — not actually dynamic |
| Loading states | | ✅ | | No explicit loading skeleton — Server component pre-renders |
| Empty state | ✅ | | | "No Campaigns Assigned" message exists |
| Error state | | | ❌ | No error boundary or error display |
| Campaign selector (dropdown) | ✅ | | | Multi-campaign dropdown via URL params |
| Date-range buttons | ✅ | | | 7d/14d/30d buttons, URL-driven |

### Static / Hardcoded Issues Found
- "Updated recently" text is always static (line 142) — never shows actual last sync time
- "Sep 12, 2025" hardcoded in the Updates card (line 377)
- "Active Campaigns: 1" is hardcoded integer (line 413) — not computed from actual data
- "Account Manager: Marketivity Team" is hardcoded (line 412)
- Platform chips "Facebook" and "Instagram" are hardcoded (lines 206-208)
- Recommendations cards are fully static/hardcoded (lines 390-404)
- Campaign Details section is hidden (display: none) and contains hardcoded location/age/gender values

---

## 4. REQUIRED V1 GAP ANALYSIS

### A. DATE RANGE OPTIONS

**Current state:**
- 7d, 14d, 30d implemented via `?days=N` URL param
- `days` validated against `[7, 14, 30]`, anything else falls back to 7

**"Today" gap:**
- Not implemented. The `[7,14,30]` whitelist actively rejects `days=0` or `days=1`.
- Fix: Add `0` or `'today'` to the allowed range list and handle in page.tsx.

**"Maximum" gap:**
- Not implemented anywhere in UI or backend.
- See Section 8 for full analysis.

### B. MESSAGING METRICS GAP

**Messaging conversations started:**
- Meta API provides this via the `actions` array in Insights responses.
- Specifically: action_type = `"onsite_conversion.messaging_conversation_started_7d"` OR `"onsite_conversion.messaging_first_reply"` depending on campaign setup.
- The current insights query requests fields: `campaign_id,impressions,reach,clicks,spend,cpc,cpm,ctr`
- The `actions` field is NOT requested. Therefore messaging data is never returned by Meta, never stored, and cannot be shown.
- This is a SYNC gap, a SCHEMA gap, and a UI gap simultaneously.

**Cost per messaging conversation:**
- Meta API provides this via `cost_per_action_type` array.
- Specifically: action_type = `"onsite_conversion.messaging_conversation_started_7d"`
- Again: NOT requested, NOT stored, NOT displayed.

### C. CAMPAIGN STATUS / SETTINGS GAP

From the live database audit:

| Field | Schema | Actual Data State | Sync Mechanism |
|-------|--------|-------------------|----------------|
| status | ✅ TEXT column | Present (ACTIVE/PAUSED) for all | Discovery only — NOT refreshed by cron |
| effective_status | ✅ TEXT column (added migration 0006) | NULL for 5 of 7 campaigns | Discovery only — NOT refreshed by cron |
| daily_budget | ✅ NUMERIC(12,2) column | NULL for 6 of 7 campaigns | Discovery only — NOT refreshed |
| lifetime_budget | ❌ NOT IN SCHEMA | Not applicable | Not fetched from Meta |
| start_time | ✅ TIMESTAMPTZ column | NULL for ALL campaigns | Discovery only — NOT refreshed |
| end_time | ✅ TIMESTAMPTZ column | NULL for ALL campaigns | Discovery only — NOT refreshed |
| buying_type | ✅ TEXT column (added migration 0006) | Stored during discovery | Discovery only — NOT refreshed |
| objective | ✅ TEXT column | Stored during discovery | Discovery only — NOT refreshed |

**Critical findings:**
- `effective_status` is NULL for most campaigns because the discovery API call in `client.ts` line 81-83 fetches `id,name,status,effective_status,objective,buying_type,account_id` — however no refresh mechanism updates these after initial sync.
- `start_time` and `end_time` are NULL for ALL campaigns. The discovery endpoint does NOT currently request `start_time` or `stop_time` from Meta.
- `daily_budget` is mostly NULL. Meta campaigns may have `daily_budget` OR `lifetime_budget` depending on budget type. The current discovery does not fetch either.
- `lifetime_budget` column does NOT EXIST in the schema. This needs a migration.

**Meta Note on budget:**
- `daily_budget` (cents): Set when campaign uses daily budget. NOT set for lifetime budget campaigns.
- `lifetime_budget` (cents): Set when campaign uses lifetime/total budget. NOT set for daily budget campaigns.
- A campaign will have exactly ONE of these set, never both at the campaign level.

---

## 5. META API CAPABILITY ANALYSIS

### Currently Requested Fields (insights endpoint)
```
campaign_id, impressions, reach, clicks, spend, cpc, cpm, ctr
```

### Required Additional Fields for V1

#### For insights (add to getDailyCampaignInsights):
| Field | Type | Notes |
|-------|------|-------|
| `actions` | Array | Contains action_type + value pairs. Required for messaging metrics |
| `cost_per_action_type` | Array | Contains action_type + value pairs for cost per action. Required for cost per conversation |

#### For campaign discovery (add to getCampaigns):
| Field | Meta Field Name | Notes |
|-------|----------------|-------|
| Start date | `start_time` | UNIX timestamp format |
| End date | `stop_time` | UNIX timestamp — Meta uses stop_time not end_time |
| Daily budget | `daily_budget` | In account currency minor units (cents) |
| Lifetime budget | `lifetime_budget` | In account currency minor units (cents) |
| Effective status | Already requested | But not being stored consistently |

### Messaging Action Type Classification
**Directly returned from Meta (via actions array):**
- `onsite_conversion.messaging_conversation_started_7d` — Messaging conversations started (within 7 days of seeing/clicking ad)
- `onsite_conversion.messaging_first_reply` — First replies (different from conversations started)

**Derived locally:**
- Cost per messaging conversation = spend / messaging_conversations_started

**IMPORTANT:** The correct action type depends on campaign objective and ad setup. For campaigns with objective `OUTCOME_ENGAGEMENT` using Messenger placements, `onsite_conversion.messaging_conversation_started_7d` is the standard metric. This must be confirmed per campaign before displaying.

### App Publishing Status Impact
The Meta app is currently **unpublished (development mode)**. This means:
- The app can only access data for users who are listed as app testers, developers, or administrators in the Meta App dashboard.
- Campaigns belonging to users who have explicitly granted the app access work correctly.
- The `#200 permission error` on `act_123456789` (a seed/test account) is expected and not blocking real client data.
- **This does NOT block the current production use case** as long as the Meta account owner (Marketivity) is a developer/admin of the app.
- Publishing the app would be required before onboarding clients whose Meta accounts are separate from Marketivity's.

---

## 6. DATABASE GAP ANALYSIS

### campaigns table — Missing/Unreliable Columns
| Column | Status | Issue |
|--------|--------|-------|
| `lifetime_budget` | ❌ MISSING | Not in any migration. Needs ALTER TABLE + Meta fetch |
| `start_time` | ⚠️ Exists but NULL | Not fetched from Meta during discovery |
| `end_time` | ⚠️ Exists but NULL | Not fetched (Meta field is `stop_time`) |
| `effective_status` | ⚠️ Exists but NULL for most | Not refreshed after initial discovery |
| `daily_budget` | ⚠️ Exists but NULL for most | Not fetched from Meta during discovery |
| `updated_at` | ✅ Exists | But never updated by refresh mechanism |

### campaign_insights table — Missing Columns
| Column | Status | Issue |
|--------|--------|-------|
| `messaging_conversations_started` | ❌ MISSING | Needs new column + backfill strategy |
| `cost_per_messaging_conversation` | ❌ MISSING | Needs new column |
| `actions_json` | Optional | Raw actions array storage for future flexibility |
| `frequency` | ❌ MISSING | Displayed as hidden in UI but not stored |
| `link_clicks` | ❌ MISSING | Current `clicks` is top-level Meta clicks, not link-specific |

### RLS — No Changes Needed
Current RLS is correctly structured:
- Clients can only see campaigns via campaign_assignments join
- Clients can only see campaign_insights for campaigns they're assigned to
- Admins are org-scoped
- service_role bypasses RLS for cron operations (correct)

### Index Needs for V1
| Index | Status | Need |
|-------|--------|------|
| `idx_campaign_insights_campaign_id` | ✅ Exists | Covered |
| `idx_campaign_insights_date` | ✅ Exists | Covered |
| Composite `(campaign_id, date)` | Implied by UNIQUE constraint | Covered for point lookups |
| Composite `(campaign_id, date DESC)` | ❌ Not explicit | Needed for "Maximum" queries ordering |

---

## 7. SYNC / FRESHNESS ANALYSIS

### Current Cron Behavior
| Property | Current Value |
|----------|--------------|
| Schedule | Once daily at UTC 08:00 |
| Window synced | D-1 and D-2 (in ad account timezone) |
| Retry | Up to 3 attempts with exponential backoff |
| Timeout | 300 seconds (Vercel maxDuration) |
| Token error handling | Disconnects meta_connection on code 190 |
| Campaign metadata refresh | NEVER |

### Freshness Reality
| Data Type | Actual Freshness | Presented as |
|-----------|-----------------|--------------|
| Insights (spend, impressions, etc.) | Up to 24 hours stale | "Updated recently" (static label) |
| Campaign status | Stale since last discovery | Shown as current |
| Campaign budget | NULL or stale | Shown as current or N/A |
| Campaign start/end dates | NULL | Shown as "N/A" |
| Sync timestamp | Never shown | "Updated recently" (hardcoded) |

### Historical Coverage
| Stat | Value |
|------|-------|
| Earliest stored insight | 2026-06-04 |
| Latest stored insight | 2026-09-14 |
| Total rows | 6 rows |
| Campaigns with insights | 3 of 7 campaigns |
| Historical backfill | Partially done manually via ?date= param |
| Automated backfill | None — only D-1 and D-2 daily |

**KEY FINDING:** The total insight history is only 6 rows. This is NOT a sufficient basis for a meaningful "Maximum" view. The historical coverage is sparse and manually seeded.

---

## 8. MAXIMUM RANGE ANALYSIS

### What "Maximum" Can Mean

**Option A — True Meta Lifetime (fetch from Meta on demand):**
- Requires calling Meta API at dashboard load time for each client visit
- Hits Vercel serverless timeout risk for large accounts
- Rate limits could be hit for clients with long campaign histories
- Exposes access tokens to more requests
- NOT safe for V1 as a dashboard-load-time call

**Option B — Maximum Available in Our Database:**
- Query: WHERE campaign_id = ? (no date filter)
- Returns whatever is in campaign_insights for the selected campaign
- Safe, fast, no extra API calls
- Reliable and consistent
- BUT currently only contains 6 rows total — sparse history

**Recommended V1 Approach: Option B (DB Maximum)**
For V1, "Maximum" should mean: all insight data available in the database for the selected campaign. This is honest (label it: "All available data"), safe, and fast. The sync system will accumulate data over time.

For proper historical coverage, a one-time admin-triggered backfill (using the ?date= mechanism already in the cron endpoint) should be recommended to populate history before launch.

**Implementation:** In page.tsx, when `range=maximum` (new URL param), skip date filtering and return all insights for the campaign. No DB schema change needed. Only UI + page.tsx changes.

---

## 9. REAL-TIME FEASIBILITY ANALYSIS

### What Is Actually Real-Time
- **Nothing.** No metric is real-time. The architecture is entirely batch/cron-based.

### What Is Near-Real-Time
- **Nothing currently.** With an hourly cron (not yet implemented), insights would be near-real-time.

### What Is Daily
- Insights (spend, impressions, clicks, reach, CPC, CPM, CTR) — synced once at UTC 08:00

### What Is Permanently Stale Until Manual Action
- Campaign status, budget, start/end dates — synced only during Meta connection discovery, never refreshed

### V1 Safe Recommendation
Do NOT claim real-time. The sync notice should read:
> "Data updated daily from Meta Marketing API. Last updated: [timestamp from sync_logs]."

For V1, also add a campaign metadata refresh mechanism that:
1. Runs alongside the daily insights sync
2. Re-fetches campaign fields (status, effective_status, daily_budget, lifetime_budget, start_time, stop_time) from Meta
3. Updates the campaigns table accordingly

A "manual refresh" button can be considered for V1.1 but is NOT needed for V1.

---

## 10. RECOMMENDED V1 ARCHITECTURE

The recommended V1 architecture adds three things to the existing foundation:

### A. Insights Schema Extension
Add to `campaign_insights`:
- `messaging_conversations_started` INTEGER
- `cost_per_messaging_conversation` NUMERIC(12,4)
- `link_clicks` INTEGER (distinct from top-level `clicks`)

### B. Campaign Metadata Refresh
Add to the daily cron:
- Re-fetch campaign fields: `status, effective_status, daily_budget, lifetime_budget, start_time, stop_time`
- Add `lifetime_budget` column to campaigns table (NUMERIC(12,2))
- Update campaigns table rows accordingly

### C. Dashboard Date Range Extension
Add to page.tsx:
- `range=today`: date filter WHERE date = today in ad account timezone
- `range=maximum`: no date filter — return all rows for campaign
- Update the `?days=` param validation to also accept these range types

### D. Sync Timestamp Exposure
Add to page.tsx:
- Query latest sync_log for the campaign's ad_account
- Pass `lastSyncedAt` to DashboardClient
- Display as actual timestamp replacing "Updated recently"

---

## 11. V1 BLOCKING REQUIREMENTS (PRIORITY 0)

These must be done before the portal is presented to clients as production-ready:

1. **Messaging Conversations Started** — New schema column + new Meta API field (`actions`) + sync update + UI display
2. **Cost Per Messaging Conversation** — New schema column + new Meta API field (`cost_per_action_type`) + sync update + UI display  
3. **Daily Budget display** — Fix campaign discovery to fetch `daily_budget` from Meta + refresh in cron
4. **Lifetime Budget** — New schema column + fetch from Meta + refresh in cron + UI display
5. **Campaign Start Date** — Fix discovery to fetch `start_time` from Meta + refresh in cron
6. **Campaign End Date** — Fix discovery to fetch `stop_time` from Meta + refresh in cron + handle null (Ongoing)
7. **Maximum Date Range** — UI button + page.tsx handling (DB-based, no Meta call needed)
8. **Today Date Range** — UI button + page.tsx handling
9. **Last Synced Timestamp** — Query sync_logs + display actual timestamp to client
10. **Remove all hardcoded static content** — "Sep 12, 2025", "Active Campaigns: 1", hardcoded location/age/gender

---

## 12. V1.1 ROADMAP (PRIORITY 1)

After the portal launches with V1:

1. **Effective Status** — Refresh in cron (column exists but stale), display distinctly from status
2. **Hourly sync** (or 2x/day) for fresher insights
3. **Manual refresh button** for campaign metadata
4. **Frequency metric** — Requires `frequency` field from Meta + schema column
5. **Link Clicks** — Distinct from top-level clicks; requires `outbound_clicks` or `inline_link_clicks` Meta field
6. **CTR denominator clarity** — Currently CTR is calculated locally; should use Meta's returned `ctr` value which is link-click CTR
7. **Campaign health indicator** — ACTIVE vs PAUSED vs BUDGET_EXCEEDED visual badge
8. **Budget utilization** — spend/daily_budget * 100 for daily campaigns
9. **Multiple campaigns comparison view** — Basic side-by-side KPI table
10. **Error state UI** — Show meaningful message if data fetch fails

---

## 13. POST-V1 ROADMAP (PRIORITY 2)

1. **Week-over-week / date-over-date comparison** — Requires two separate date window queries
2. **Spend pacing** — spend to date vs expected spend at daily budget
3. **Performance trend indicator** — Arrow/badge showing if impressions/spend trending up or down vs prior period
4. **Outbound clicks / Link clicks** — Meta `outbound_clicks` action type
5. **Lead campaigns** — `lead` action type, cost per lead
6. **Admin client management page** — Campaign assignment, budget entry, notes
7. **Admin-written client updates** — Replace hardcoded update card with DB-stored messages
8. **Export to CSV** — Basic table export of insights data for selected date range
9. **Campaign performance history chart** — Already partially implemented; improve chart metric switching

---

## 14. AI ROADMAP (PRIORITY 3)

These require a stable, rich data foundation and MUST NOT block or delay V1:

1. **AI Summary** — "This week your campaign reached X people and generated Y conversations at $Z cost."
2. **AI Recommendations** — Replace static recommendation cards with dynamic Gemini-powered analysis
3. **Natural language date input** — "Show me last month's data"
4. **Ask Marketivity AI** — Conversational Q&A about campaign performance
5. **Predictive spend** — "At current pace, you will spend $X by end of month"
6. **Anomaly detection** — Alert when spend or CTR changes significantly

---

## 15. RISKS

| Risk | Severity | Notes |
|------|---------|-------|
| App unpublished on Meta | HIGH | Limits API access to app team members only. Must publish before client onboarding at scale. |
| `clicks` field semantic mismatch | HIGH | Top-level `clicks` includes ALL ad interactions (swipes, reactions, link clicks). Should be `inline_link_clicks` or `outbound_clicks` for meaningful reporting. |
| Stale campaign metadata | HIGH | Status/budget/dates not refreshed after discovery. Client may see wrong data. |
| No historical backfill | MEDIUM | "Maximum" range will show sparse data until systematic backfill runs |
| Daily sync freshness | MEDIUM | Data up to 24h stale. "Updated recently" label is misleading. |
| No error state in dashboard | MEDIUM | If a DB query fails, client sees blank data with no explanation |
| Hardcoded static content | MEDIUM | "Sep 12, 2025" update date, hardcoded location/demographics |
| Missing UNIQUE index for maximum queries | LOW | Performance: no explicit composite index for ORDER BY date DESC across full campaign history |

---

## 16. PERFORMANCE CONSIDERATIONS

| Operation | Current Cost | V1 Impact |
|-----------|-------------|-----------|
| Dashboard page load | ~1-2 Supabase queries | +1 query for sync_logs timestamp |
| 7/14/30d insights query | Indexed (campaign_id + date) | Fast, no change |
| "Maximum" query | Not yet implemented | Full table scan per campaign — currently 6 rows, will grow. Add index if >10k rows. |
| Cron: add messaging fields | +0 latency (same API call) | Negligible |
| Cron: add campaign metadata refresh | +1 Meta API call per ad account per run | Acceptable within 300s timeout |
| Meta `actions` array storage | ~500 bytes JSON per insight row | Acceptable |

For V1 scale (1-50 clients, 1-10 campaigns each), no caching or aggregation tables are needed. Raw queries are fast enough.

---

## 17. SECURITY CONSIDERATIONS

The current security model is solid and must be preserved:

| Control | Status | Notes |
|---------|--------|-------|
| No Meta token in browser | ✅ ENFORCED | Token decrypted server-side only, never passed to client |
| RLS on all tables | ✅ ENFORCED | Clients can only access their assigned data |
| Service role key server-side only | ✅ ENFORCED | Only used in admin client and cron |
| CRON_SECRET header validation | ✅ ENFORCED | Cron endpoint requires Bearer token |
| Organization isolation | ✅ ENFORCED | All queries are org-scoped |
| Client identity from session | ✅ ENFORCED | requireAuth() + profile.client_id — no URL param trust |

**All V1 additions must preserve these controls.** Specifically:
- Messaging metrics must come from the database (already synced server-side), not from a client-side Meta API call
- Campaign metadata refresh must go through the cron/admin endpoint, not a client-triggered API call
- Any new DB columns must inherit existing RLS (they will automatically)

---

## 18. EXACT IMPLEMENTATION ORDER FOR NEXT STEPS

Given all findings, the recommended implementation sequence for V1:

1. **STEP 3.5-B** — Campaign Metadata Refresh + Schema Completion
   - Add `lifetime_budget` column to campaigns
   - Update getCampaigns() to fetch `daily_budget, lifetime_budget, start_time, stop_time, effective_status`
   - Add campaign metadata refresh call to the daily cron
   - Dashboard displays real budget + dates

2. **STEP 3.5-C** — Messaging Metrics: Schema + Sync + Display
   - Add `messaging_conversations_started` + `cost_per_messaging_conversation` to campaign_insights
   - Add `actions` + `cost_per_action_type` to insight API request
   - Parse and store messaging action values in sync
   - Display in dashboard KPI cards

3. **STEP 3.5-D** — Date Range: Maximum + Today + Last Synced Timestamp
   - Add `?range=maximum` and `?range=today` URL params to page.tsx
   - Add UI buttons alongside 7d/14d/30d
   - Expose last synced timestamp from sync_logs
   - Fix "Updated recently" to show actual timestamp

4. **STEP 3.5-E** — Content Cleanup + Polish
   - Remove all hardcoded static strings
   - Make "Active Campaigns: N" dynamic
   - Fix "platform" chips to be dynamic or remove
   - Add basic error state UI

---

# RECOMMENDED NEXT IMPLEMENTATION STEP

---

## NEXT STEP: STEP 3.5-B — CAMPAIGN METADATA REFRESH + SCHEMA COMPLETION

**Objective:**
The campaigns table currently stores metadata (daily_budget, effective_status, start_time, end_time) that is either NULL or stale, because it was only populated during initial Meta connection discovery and is never refreshed. The `lifetime_budget` field does not exist in the schema at all. This step adds a `lifetime_budget` column to the campaigns table, extends the Meta campaign discovery query to fetch all required budget and date fields, and adds a campaign metadata refresh step to the existing daily cron so that campaign status, budget, and dates stay accurate automatically.

**Why now:**
Campaign status and budget are the most fundamental facts about a campaign. Showing "N/A" for daily budget and start date is a trust problem with clients. This is entirely server-side infrastructure work with no security risk and directly unblocks the display of budgets and dates. It is also a prerequisite for V1.1 budget utilization calculations. The messaging metrics work (Step 3.5-C) is more complex and should come after the metadata foundation is solid.

**Files likely affected:**
- `supabase/migrations/[new].sql` — Add `lifetime_budget NUMERIC(12,2)` to campaigns
- `lib/meta/server/client.ts` — Extend getCampaigns() to fetch `daily_budget, lifetime_budget, start_time, stop_time`
- `app/api/cron/sync-insights/route.ts` — Add campaign metadata refresh loop after insights sync
- `app/dashboard/page.tsx` — Pass budget and date fields as props (already in campaigns select)
- `app/dashboard/DashboardClient.tsx` — Display real daily_budget, lifetime_budget, start_time, end_time

**DB changes:** Yes — one new column: `campaigns.lifetime_budget NUMERIC(12,2)`

**Meta API changes:** Yes — extend getCampaigns() to request: `daily_budget, lifetime_budget, start_time, stop_time, effective_status`

**UI changes:** Yes — display daily_budget, lifetime_budget, start_date, end_date in Campaign Status card

**Sync changes:** Yes — add campaign metadata refresh step to daily cron

**Risks:**
- Low. Additive-only changes. Existing insights sync is unaffected.
- Budget fields returned by Meta are in account currency minor units (e.g., cents for USD) and must be divided by 100 for display.
- `stop_time` may be NULL for campaigns without an end date — display as "Ongoing".
