# Marketivity Client Portal — Security Model
`docs/SECURITY_MODEL.md`

---

## 1. Authentication

The system uses **Supabase Auth** exclusively for identity management.
- Custom password storage and custom JWT signing are explicitly avoided to prevent cryptographic vulnerabilities.
- Next.js SSR middleware (`lib/supabase/middleware.ts`) verifies the session securely on every request to a protected route.
- The `SUPABASE_SERVICE_ROLE_KEY` is completely isolated from the browser and is not prefix with `NEXT_PUBLIC_`.
- The login flow uses standard email/password authentication via `@supabase/ssr` to establish a secure HTTP-only cookie session.

## 2. Roles & Authorization

Authorization is strictly role-based, managed within the `profiles` table:
- **`super_admin`**: Full platform access.
- **`admin`**: Full access within their assigned `organization_id`.
- **`client`**: Restricted access. Can only view campaigns linked via `campaign_assignments`.

To safely retrieve roles in Server Components, the `getCurrentProfile()` SSR helper in `lib/supabase/auth.ts` validates the session token and performs a database lookup on the `profiles` and `clients` tables to securely map the identity.

## 3. Row Level Security (RLS) & Client Isolation

PostgreSQL RLS is the primary mechanism for data isolation. We do NOT rely on frontend filtering.
Even if a malicious client manages to manipulate an API request to request Campaign B while assigned to Campaign A, the database will return 0 rows.

**How Client Isolation Works:**
1. User authenticates via Supabase Auth.
2. The custom Postgres function `get_auth_client_id()` resolves `auth.uid()` to `profiles.client_id`.
3. The `campaigns` RLS policy checks if the campaign's ID exists in `campaign_assignments` where `client_id` equals the authenticated user's client ID.
4. If it does not, access is completely denied at the database engine level.

**RLS Policies Implemented:**
- `profiles`: Users can read only their own profile.
- `clients`: Clients can read only their own client record.
- `campaign_assignments`: Clients can read only assignments containing their `client_id`.
- `campaigns`: Clients can read only campaigns joined through their assignments.
- `ad_accounts` & `sync_logs`: Restricted entirely to admins/super_admins.

*Security Note: All `SECURITY DEFINER` Postgres functions explicitly run with `SET search_path = public` to prevent malicious schema injection.*

## 4. Server vs. Client Secrets

- **Client Bundle**: Only contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These are safe to expose by design, as RLS protects the actual data.
- **Server Bundle**: Contains the secure session parsing logic.
- **Future Secrets**: Meta Marketing API tokens and the `SUPABASE_SERVICE_ROLE_KEY` (if needed for admin endpoints) will be stored securely on the server environment or within a secure database vault.

## 5. Threat Considerations

- **Horizontal Privilege Escalation**: Prevented by RLS. Client A cannot read Client B's data.
- **Vertical Privilege Escalation**: Prevented by strict CHECK constraints on the `profiles` table and the requirement that `role` modification is protected by RLS (clients cannot update their own role).
- **Session Hijacking**: Mitigated by Supabase's secure, HTTP-only cookie strategy handled in the Next.js middleware.
- **Auth Bypass**: Hardcoded developer "demo login" overrides have been completely removed.
