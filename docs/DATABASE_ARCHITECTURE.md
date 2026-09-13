# Marketivity Client Portal — Database Architecture
`docs/DATABASE_ARCHITECTURE.md`

---

## 1. Core Architecture Pattern

The system uses a **multi-tenant inspired architecture** where `organizations` act as the top-level container, and `clients` belong to those organizations.

Although Marketivity is currently the only organization, this foundation ensures the platform can scale gracefully.

## 2. Entities & Schema

### `organizations`
The top-level tenant (Marketivity).
- **Primary Key**: `id` (UUID)
- **Fields**: `name`, `slug`

### `clients`
Represents an agency client company/account.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `organization_id` → `organizations(id)`
- **Fields**: `name`, `email`, `company_name`, `status`

### `profiles`
The application-level user profile, linking Supabase Auth to business logic.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `auth_user_id` → `auth.users(id)`
- **Foreign Key**: `organization_id` → `organizations(id)`
- **Foreign Key**: `client_id` → `clients(id)` (Nullable)
- **Fields**: `role` (`super_admin`, `admin`, `client`), `full_name`, `email`
- **Constraint**: If `role` is `client`, then `client_id` MUST be populated.

### `ad_accounts`
Meta advertising accounts managed by Marketivity.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `organization_id` → `organizations(id)`
- **Fields**: `name`, `meta_ad_account_id` (UNIQUE), `status`
- **Note**: Does NOT store Meta access tokens (handled in a future phase).

### `campaigns`
Individual Meta campaigns.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `ad_account_id` → `ad_accounts(id)`
- **Fields**: `meta_campaign_id` (UNIQUE), `name`, `objective`, `status`, `daily_budget`, `start_time`, `end_time`

### `campaign_assignments`
The critical junction table controlling which client can view which campaign.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `campaign_id` → `campaigns(id)`
- **Foreign Key**: `client_id` → `clients(id)`
- **Constraint**: UNIQUE(`campaign_id`, `client_id`)

### `sync_logs`
Tracks Meta API data ingestion (for Phase 2).
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `ad_account_id` → `ad_accounts(id)`
- **Fields**: `status`, `started_at`, `completed_at`, `records_synced`, `error_message`

## 3. The Assignment Model

Campaigns are NOT assigned to clients directly via a foreign key on the `campaigns` table.
Instead, we use `campaign_assignments`.

This handles edge cases where:
1. Multiple clients might need to view the same campaign.
2. A single Meta Ad Account contains campaigns belonging to different clients.

**Data Flow:**
```
Client (User) -> Profiles -> Client Record -> Campaign Assignment -> Campaign
```

## 4. Future Meta Integration Points

When Phase 2 introduces Meta API syncing:
1. **Tokens**: Will likely be stored in a separate secure table (`organization_integrations`) or Vault, never exposed to clients.
2. **Insights**: A `campaign_insights` table will be created to store daily aggregated metrics (spend, reach, results) referencing `campaign_id`.
