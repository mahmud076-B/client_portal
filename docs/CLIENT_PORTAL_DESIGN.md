# Marketivity Client Portal — Design Documentation
`docs/CLIENT_PORTAL_DESIGN.md` | Version 1.0 | September 2025

---

## 1. Portal Purpose

The Marketivity Client Portal is a **dedicated, standalone reporting product** — completely separate from the Marketivity agency website.

Its single purpose is to allow Marketivity clients to securely log in and view their advertising campaign performance in a professional, simple, and trustworthy dashboard.

**This is NOT:**
- A marketing website
- A services page
- A portfolio or case studies page
- A contact form or landing page

**This IS:**
- A private client-facing analytics and reporting dashboard
- A direct communication channel between Marketivity and clients
- A place where clients can understand their campaigns without needing marketing expertise

---

## 2. User Flow

```
Client receives portal access credentials (email + password from Marketivity admin)
        ↓
Client opens portal: portal/login.html
        ↓
Client enters email + password → POST /api/auth/login (production)
        ↓
Authenticated → redirect to: portal/dashboard.html
        ↓
Client lands on dashboard showing:
  • Campaign status (LIVE / PAUSED / ATTENTION REQUIRED)
  • Key performance metrics (Spend, Reach, Impressions, Results, Cost per Result)
  • Secondary metrics (CTR, CPC, CPM, Frequency)
  • Performance chart (Results / Spend / Cost per Result over time)
  • Campaign status card
  • Marketivity Update (from agency team)
  • Recommendations (from agency team)
  • Recent Activity timeline
  • Campaign Details (expandable)
```

---

## 3. File Structure

```
ClientPortal/
├── Official_Logo.jpeg          ← Official brand mark (never modify)
├── design-system/
│   └── index.html              ← Design System Foundation v1.0
├── portal/
│   ├── login.html              ← Client login screen
│   └── dashboard.html          ← Client campaign dashboard
└── docs/
    └── CLIENT_PORTAL_DESIGN.md ← This document
```

---

## 4. Login Screen — `portal/login.html`

### Layout
- **Two-column split**: Left dark brand panel + Right white form panel
- On mobile (≤900px): Left panel hidden; form takes full screen with logo shown

### Left Panel (Brand)
- Official Marketivity logo
- Brand headline: "Your campaigns, clearly presented."
- Three trust indicators: Live Metrics / Marketivity Updates / Private & Secure
- Footer: copyright + location

### Right Panel (Form)
- "Secure Client Portal" badge with animated orange dot
- Welcome heading + supporting explanation
- Email field with icon
- Password field with show/hide toggle
- "Forgot password?" link
- Sign In button (dark, with orange gradient overlay on hover)
- Loading state (spinner animation on submit)
- Error state (red alert box for incorrect credentials)
- "Need access? Contact Marketivity" footer link

### Demo Credentials (Development Only)
```
Email:    client@demo.com
Password: demo2025
```
Replace with real auth (JWT / session) in production.

### Auth Flow (Production)
```
POST /api/auth/login
Body: { email, password }
Response 200: { token, clientId, name }
Response 401: { error: "Invalid credentials" }
```
On success: store token in httpOnly cookie or sessionStorage, redirect to dashboard.html.

---

## 5. Dashboard — `portal/dashboard.html`

### Layout System
- **Sidebar** (240px fixed, dark `#181818`) + **Main area** (fluid, `#F2F1EE` background)
- Sticky top bar with backdrop blur
- Mobile (≤860px): Sidebar collapses to hamburger-triggered slide-in + mobile bottom nav

### Components

#### Sidebar
| Element | Detail |
|---------|--------|
| Logo | Official_Logo.jpeg, 34px height |
| Nav links | Dashboard (active), Campaigns (badge: 1), Updates (badge: 2) |
| Client identity | Avatar (gradient), Name, Company |
| Sign Out | Navigates to login.html |

#### Top Bar
| Element | Detail |
|---------|--------|
| Page title | "Campaign Dashboard" |
| Sync indicator | Green dot + "Updated 5 min ago" |
| Account avatar | Gradient circle with initials |

#### Dashboard Header
| Element | Detail |
|---------|--------|
| Greeting | "Good evening, [Client Name]." |
| Subtitle | "Here's how your campaign is performing right now." |
| Status pill | 🟢 LIVE (green pulse animation) / 🟡 PAUSED / 🔴 ATTENTION |
| Last synced | "Last synced 5 minutes ago" with refresh icon |

#### Campaign Selector Bar
| Element | Detail |
|---------|--------|
| Campaign name | "Rahman Retail — Messages" |
| Status | Active (green dot) |
| Objective | "Messaging Conversations" |
| Platform | Facebook + Instagram chips |
| Date range | 7d / 14d / 30d selector buttons |

#### Primary KPI Cards
| Metric | Mock Value | Description |
|--------|-----------|-------------|
| Total Spend | $4.00 | With "of $5.00 daily budget" subtext |
| Reach | 8,714 | Unique accounts reached |
| Impressions | 11,216 | Total ad views |
| Results | 18 | Messaging conversations (adapts by objective) |
| Cost per Result | $0.22 | Per conversation |

#### Secondary Metrics Row
| Metric | Mock Value |
|--------|-----------|
| CTR | 0.49% |
| CPC | $0.22 |
| CPM | $0.36 |
| Frequency | 1.29 |

#### Performance Chart
- Library: **Chart.js 4.4** (CDN)
- Type: Line chart with gradient fill
- Default view: Results (green)
- Switchable: Spend (orange) / Cost per Result (purple)
- 14-day date range (default)
- Tooltips: dark background, formatted values

#### Campaign Status Card
- Shows: LIVE indicator + description + campaign name, objective, start date, daily budget, amount spent

#### Expandable Campaign Details
- Toggle accordion: Campaign / Platform / Placements / Audience / Location / Age / Gender / End Date / Billing

#### Marketivity Update Card (Dark)
- Types: Performance Update (orange) / Optimization Update (purple) / Important Notice (red) / Recommendation (green)
- Fields: Update type badge, title, body text, team member avatar, date
- Content managed by Marketivity admin in production

#### Recommendations Section
- 3 recommendation cards with colored icon boxes
- Types: Creative / Audience / Budget
- Each: type label + descriptive text in plain language

#### Recent Activity Timeline
- Grouped by date (Today / Yesterday / Sep X)
- Each item: colored timeline dot + title + supporting description
- Color coding: orange (primary) / purple (secondary) / green (positive) / grey (neutral)

#### Account Info Card
- Client name, account manager, active campaigns count, portal access status
- Contact link: `mailto:hello@marketivity.com`

---

## 6. Campaign Objective Adaptation

The dashboard is designed to adapt metric labels by campaign objective:

| Objective | Results Label | Cost per Result Label |
|-----------|-------------|----------------------|
| Messaging | Messaging Conversations | Cost per Conversation |
| Leads | Leads | Cost per Lead |
| Sales | Purchases | Cost per Purchase |
| Traffic | Link Clicks | Cost per Click |
| Awareness | Reach / Impressions | CPM |

In production, objective is fetched from the Meta API and metric labels are set dynamically.

---

## 7. Mock Data (Development Only)

All values marked with the purple demo notice banner are illustrative:

```javascript
/* Replace with Meta Marketing API responses in production */
const MOCK = {
  labels14: ['Aug 30','Aug 31','Sep 1',...,'Sep 12'],
  results:  [0, 0, 1, 0, 2, 1, 0, 2, 2, 3, 2, 3, 1, 1],
  spend:    [0, 0, 5, 4, 5, 5, 5, 5, 4.5, 5, 5, 5, 4, 4],
  cpr:      [0, 0, 5.0, 0, 2.5, 5.0, 0, 2.5, 2.25, 1.67, 2.5, 1.67, 4.0, 4.0],
};
```

---

## 8. Meta Marketing API — Integration Points

When connecting to the Meta Marketing API, the following endpoints map to dashboard components:

| Dashboard Component | Meta API Endpoint |
|--------------------|------------------|
| Campaign status | `GET /act_{ad_account_id}/campaigns` |
| Spend, Reach, Impressions | `GET /{campaign_id}/insights?fields=spend,reach,impressions` |
| Results, Cost per Result | `GET /{campaign_id}/insights?fields=actions,cost_per_action_type` |
| CTR, CPC, CPM, Frequency | `GET /{campaign_id}/insights?fields=ctr,cpc,cpm,frequency` |
| Performance chart (daily) | `GET /{campaign_id}/insights?time_increment=1&date_preset=last_14d` |
| Campaign details | `GET /{campaign_id}?fields=name,status,objective,daily_budget,start_time,end_time` |
| Ad set details (targeting) | `GET /{adset_id}?fields=targeting,daily_budget,status` |

**Authentication:**
```
Authorization: Bearer {META_ACCESS_TOKEN}
```
Store access tokens server-side. Never expose to client browser.

**Sync strategy:**
- Sync campaign insights every 15–30 minutes via a server-side cron
- Cache results in database (per client, per campaign, per date)
- Dashboard shows cached data with "Last synced X minutes ago" timestamp

---

## 9. Client Data Isolation

**Critical architecture requirement:**

Each client must ONLY access their own data. Isolation must be enforced at:

1. **Authentication layer**: JWT token contains `clientId` claim
2. **API routes**: All data queries include `WHERE client_id = ?` — never trust client-supplied IDs
3. **Database schema**: All tables include `client_id` foreign key
4. **Campaign assignment**: Campaigns are explicitly assigned to clients by admin — clients never access raw Meta account data
5. **UI layer**: UI shows only assigned campaigns (not all campaigns on account)

**Minimum database schema:**
```sql
clients (id, email, password_hash, name, company, status, created_at)
campaigns (id, client_id, meta_campaign_id, name, status, objective, daily_budget, start_date, created_at)
insights_cache (id, campaign_id, date, spend, reach, impressions, results, cpr, ctr, cpc, cpm, frequency, synced_at)
updates (id, campaign_id, type, title, body, created_by, created_at)
recommendations (id, campaign_id, type, text, created_at)
activity_log (id, campaign_id, title, description, created_at)
```

---

## 10. Admin-Controlled Content (Future Phase)

Marketivity admin will eventually control via an admin panel:

| Admin Action | Effect on Client Dashboard |
|-------------|---------------------------|
| Create client | New login credentials |
| Assign campaign | Campaign appears in client selector |
| Post Update | New update appears in "Marketivity Update" section |
| Add Recommendation | New recommendation appears |
| Log Activity | New item in Recent Activity |
| Sync insights | Metrics refresh from Meta API |

Admin panel is **not in scope for Phase 1**. Build separately.

---

## 11. Responsive Behavior

| Breakpoint | Behavior |
|-----------|---------|
| Desktop ≥1024px | Full sidebar (240px) + main area |
| Tablet 860–1024px | Compressed sidebar (220px) |
| Mobile ≤860px | Sidebar hidden → hamburger trigger + slide-in overlay + bottom nav |
| Small mobile ≤480px | KPI grid 2-col, simplified campaign bar, single-col details |

**Mobile priority order:**
1. Campaign status + header
2. Primary KPI cards
3. Performance chart
4. Marketivity Update
5. Recommendations
6. Campaign Details (accordion)
7. Recent Activity

---

## 12. Animation System

| Animation | Implementation |
|-----------|---------------|
| Fade-up on scroll | IntersectionObserver + CSS transition (opacity + translateY) |
| Count-up numbers | requestAnimationFrame with cubic ease-out |
| Hover card lift | `transform: translateY(-2px)` + `box-shadow` |
| Live status pulse | CSS keyframe animation on green dot |
| Chart rendering | Chart.js built-in animation (0.8s) |
| Sidebar slide | CSS transform + transition (300ms ease-in-out) |
| Stagger delay | Elements staggered 60ms apart using `transitionDelay` |

---

## 13. Design Decisions

- **Dark sidebar on light main area**: creates clear spatial hierarchy between navigation and data
- **No orange/purple section backgrounds**: this is a data product — brand colors are accent-only
- **Demo notice banner**: purple tinted — prominently shows this is dev data, not real client data
- **"Updated 5 min ago" not "live"**: honest about Meta API data latency (no real-time stream)
- **Expandable campaign details**: keeps the primary view clean, details on demand
- **Dark Marketivity Update card**: differentiates agency communication from raw data
- **Light second update card**: shows variety in update styling, prevents visual monotony
- **Count-up animation on KPIs**: makes data feel dynamic even when static; eases visual intake

---

## 14. Recommended Next Steps

### Phase 2A — Backend
- [ ] Node.js / Python API server
- [ ] Auth endpoint (JWT)
- [ ] Client management (create, assign campaigns)
- [ ] Meta Marketing API integration (token, insights sync)
- [ ] Database setup (PostgreSQL recommended)
- [ ] Scheduled sync job (cron every 15 min)

### Phase 2B — Admin Panel
- [ ] Admin login
- [ ] Client management UI
- [ ] Campaign assignment UI
- [ ] Post updates / recommendations
- [ ] View sync status

### Phase 2C — Enhancements
- [ ] Multi-campaign selector (clients with multiple campaigns)
- [ ] Date range custom picker
- [ ] PDF report export
- [ ] Email notifications (weekly summary)
- [ ] Creative performance breakdown
- [ ] Ad set level breakdown

---

*Marketivity Client Portal — Design Documentation v1.0*
*Built on Marketivity Design System Foundation v1.0*
*Rajshahi, Bangladesh — hello@marketivity.com*
