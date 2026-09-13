# PHASE 1A — ADMIN ACCOUNT READINESS CHECK
*Generated: 2026-09-13 | Mode: READ-ONLY / AUDIT*

---

## 1. Executive Summary

This report verifies the live production database state and application code to prepare for the safe creation of the primary Marketivity Admin account. Using read-only queries via the Supabase MCP, we confirmed the exact UUID for the Marketivity organization, documented all existing profiles (including demo data), and analyzed the role resolution mechanics. Both the codebase and RLS policies treat `admin` and `super_admin` identically, making `admin` the recommended role for the owner. A step-by-step, safe manual creation strategy is outlined to prevent lockouts.

## 2. Current Role Model

**Supported Roles:** `super_admin`, `admin`, `client` (Defined in `lib/supabase/auth.ts:3`).

**Codebase & Database Evidence:**
- `requireAdmin()` (in `lib/supabase/auth.ts:96`): explicitly checks `requireRole(['admin', 'super_admin'])`.
- `requireClient()` (in `lib/supabase/auth.ts:103`): explicitly checks `requireRole(['client'])`.
- `get_auth_role()` (in `0001_rls_policies.sql:14`): Fetches role from `public.profiles`.
- **RLS Policies:** Every single admin-level RLS policy (e.g., `Admins can read org profiles`, `Admins can read org campaigns`) uses the condition: `public.get_auth_role() IN ('admin', 'super_admin')`.

**Conclusion:** `super_admin` and `admin` are treated exactly identically across the entire UI and Database security layers. No logic accidentally excludes `super_admin`, but no logic gives it extra privileges either.

## 3. Admin vs Super Admin

**Recommendation:** `admin`.
**Reasoning:** Since `admin` and `super_admin` share 100% of the same code paths and database access rights, selecting `admin` is the standard, least-risky path. It avoids the use of a conceptually higher-tier role until distinct capabilities (e.g., cross-organization global management) are actually implemented in the codebase.

## 4. Marketivity Organization

- **Organization Name:** Marketivity
- **Organization UUID:** `11111111-1111-1111-1111-111111111111`
*(Evidence: Verified via MCP live SQL query on `public.organizations`)*

## 5. Existing Admin/Client Accounts

*(Evidence: Verified via MCP live SQL query joining `public.profiles` and `auth.users`)*

**Admins:**
- `marketivitybd@gmail.com` | Role: `admin` | Full Name: `Demo User` | Org: `11111111...` (Marketivity) — *Current production admin, needs replacement.*
- `adminb@demo.com` | Role: `admin` | Full Name: `Admin User B` | Org: `21be19b3...` (Demo Org)

**Clients:**
- `smmahmudhasan076@gmail.com` | Role: `client` | Full Name: `Joy` | Org: `11111111...` (Marketivity)
- `joy331456@gmail.com` | Role: `client` | Full Name: `Porshi` | Org: `11111111...` (Marketivity)
- `clientb@demo.com` | Role: `client` | Full Name: `Demo User B` | Org: `11111111...` (Marketivity)
- `clientc@demo.com` | Role: `client` | Full Name: `Demo User C` | Org: `21be19b3...` (Demo Org)

**Note:** No profile currently holds the `super_admin` role.

## 6. Profiles Schema

*(Evidence: Verified via MCP `information_schema.table_constraints` query)*

- **Primary Key:** `id` (UUID)
- **Foreign Keys:**
  - `auth_user_id` -> `auth.users(id)` (UNIQUE constraint ensures 1:1 mapping)
  - `organization_id` -> `public.organizations(id)`
  - `client_id` -> `public.clients(id)`
- **Constraints Note (CODE ≠ DATABASE):** The database lacks explicit `CHECK` constraints enforcing that `client_id MUST BE NULL` for admins, or `client_id IS NOT NULL` for clients. This constraint is currently only handled by the TypeScript types (`lib/supabase/auth.ts`) and application logic. Manual inserts must be careful to set `client_id = NULL` for the new admin.

## 7. Current Role Resolution

Role resolution is fully dependent on the `role` column in the `public.profiles` table.
- **Server Actions/Pages:** Use `getCurrentProfile()` which queries `public.profiles` using the Auth session's `user.id`.
- **Database (RLS):** Uses the `get_auth_role()` PostgreSQL function, which executes `SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;`.

## 8. Admin Creation Method

There is no trusted internal server-action or admin UI in the current codebase capable of bypassing normal invite flows to create an agency owner from scratch. 

**Safest Procedure:** Manual creation via the official Supabase Dashboard. 
1. Use the **Authentication** tab to safely create the secure credential (bypassing any custom app routing).
2. Use the **SQL Editor** to insert the strict profile definition directly into the database, guaranteeing exact role and organization mapping without relying on incomplete application UI.

## 9. Exact Manual Creation Steps

*To be performed by the developer/owner in the Supabase Dashboard:*

1. Navigate to **Authentication > Users**.
2. Click **Add user > Create new user**.
3. Enter the owner's real email and a secure password. (Do NOT auto-confirm if email verification is enabled, or manually confirm if needed).
4. Copy the generated **User UID** for the new user.
5. Navigate to the **SQL Editor** and run the following exact template (replacing the bracketed values):

```sql
INSERT INTO public.profiles (
  auth_user_id, 
  organization_id, 
  role, 
  full_name, 
  email, 
  client_id
) VALUES (
  '<NEW_AUTH_USER_UUID>', 
  '11111111-1111-1111-1111-111111111111', 
  'admin', 
  '<OWNER_FULL_NAME>', 
  '<OWNER_EMAIL>', 
  NULL
);
```

## 10. Lockout Prevention

Do NOT deactivate or delete the existing `marketivitybd@gmail.com` account yet. Follow this exact safe verification order:

1. Create new Auth user manually via Supabase Dashboard.
2. Create corresponding profile via Supabase SQL Editor.
3. Log in to the application with the new admin account.
4. Verify access to `/dashboard` (which currently houses the admin routes).
5. Verify access to `/dashboard/admin/clients`.
6. Verify access to `/dashboard/admin/meta`.
7. Log out, then log in with the old admin account (`marketivitybd@gmail.com`) to verify it still functions as a backup.
8. **Only after Phase 1 through Phase 4 (Routing fixes) are completely deployed and tested should the old admin account be deactivated.**

## 11. Supabase MCP Capabilities Available

The connected Supabase MCP server natively exposes the following read/write capabilities:

- `list_tables` (A)
- `list_migrations` (A)
- `execute_sql` (A, C, D)
- `apply_migration` (B)
- `query_logs` (A, D)
- `get_advisors` (D)
- `get_project_url` (A)
- `get_publishable_keys` (A)
- `generate_typescript_types` (A)

*Key:*
A = Read-only Audits
B = Database Migrations
C = SQL Fixes (Write)
D = Security/Diagnostic Checks

## 12. MCP Safety Recommendation

Given that this project is connected to a live production (or production-equivalent) Supabase instance with active integrations (Meta) and real clients, the following security stance is recommended:

**Manual Approval for Writes:** The MCP agent should be restricted to **read-only operations** (`list_tables`, `query_logs`, `execute_sql` with `SELECT` only) during auditing and discovery phases. Any tool call that performs a write operation (e.g., `execute_sql` with `INSERT/UPDATE/DELETE`, or `apply_migration`) must require explicit manual approval from the human operator.

## 13. Verification Checklist

- [x] Marketivity Org UUID identified.
- [x] Existing admins and clients documented.
- [x] `admin` vs `super_admin` logic verified in code/DB.
- [x] `profiles` schema constraints audited.
- [x] Safe creation method drafted.
- [x] Lockout prevention sequence defined.
- [x] MCP tools inventoried.
