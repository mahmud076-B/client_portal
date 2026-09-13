# Client Onboarding Architecture

## 1. Product Onboarding Model
The Marketivity Client Portal operates on a single-tenant (Agency) to multi-tenant (Clients) basis. Public client and agency registration is strictly disabled. 
All clients must be securely invited by a Marketivity Admin through the `/dashboard/admin/clients` interface. 

## 2. Admin-controlled Invitation Flow
1. **Admin Authorization**: The Admin navigates to `/dashboard/admin/clients` (protected by `requireAdmin()`).
2. **Invitation Trigger**: The Admin submits the "Add Client" form (Business Name, Contact Name, Email).
3. **Server-side Orchestration**: The Server Action (`inviteClient`) handles the entire creation flow to guarantee transactional safety and tenancy enforcement.

## 3. Supabase Auth Architecture
- The system uses `auth.admin.inviteUserByEmail()` via a **server-only** Supabase Admin Client (`lib/supabase/admin.ts`).
- No passwords are ever stored, logged, or sent in plain text.
- The user receives a standard Supabase invitation email containing a secure token.

## 4. Role Assignment
- Roles (`super_admin`, `admin`, `client`) are never derived from the browser or JWT metadata during onboarding.
- The server strictly hardcodes `role = 'client'` during the `public.profiles` insertion. 
- Elevating a role to Admin is structurally impossible through this endpoint.

## 5. Organization Assignment
- The `organization_id` is derived **exclusively** from the authenticated Admin's active session (`profile.organization_id`).
- The system ignores any `organization_id` passed via form data, hidden inputs, or URL parameters. This guarantees cross-tenant isolation.

## 6. Client Creation Flow
The `inviteClient` Server Action orchestrates three atomic steps:
1. `auth.users`: Creates the identity via the Admin invite API.
2. `public.clients`: Inserts the business profile using the derived `organization_id`.
3. `public.profiles`: Links the `auth.user.id`, `client_id`, and `organization_id` together, cementing the RBAC constraints.

## 7. Invitation Lifecycle
- **Pending**: The user exists in `auth.users` but has not verified their email or set a password.
- **Active**: The user verifies their email, establishes a session via `/auth/callback`, and sets their password via `/update-password`.

## 8. Activation Flow
- The user clicks the link in the invitation email.
- The link directs them to `{{ .SiteURL }}/auth/callback?token_hash=...&type=invite`.
- The Next.js `/auth/callback` route validates the OTP token and establishes an active SSR session.
- The route detects `type=invite` and safely redirects the user to `/update-password`.
- The user updates their password and is pushed to `/dashboard`.

## 9. RLS Model
- The existing Row Level Security (RLS) policies were audited and remain fully intact.
- `public.clients` and `public.profiles` insertion is handled server-side using the Service Role Key, bypassing RLS safely because the business logic (Authorization & Tenancy validation) is explicitly enforced in the Node.js context prior to query execution.

## 10. Server-side Authorization
- The `requireAdmin()` and `requireClient()` helpers located in `lib/supabase/auth.ts` enforce strict route and Server Action access.
- Non-admin JWTs attempting to invoke the `inviteClient` action receive an immediate `UNAUTHORIZED` rejection.

## 11. Service-role Usage
- The `SUPABASE_SERVICE_ROLE_KEY` is completely isolated in `lib/supabase/admin.ts`.
- The file includes the `import 'server-only'` directive, triggering a fatal build error if a Client Component ever attempts to import it.

## 12. Email Configuration
- Supabase handles email delivery via its default or configured SMTP provider.
- The `Site URL` and `Redirect URLs` in the Supabase Dashboard must point to the production domain to ensure the `/auth/callback` route is hit successfully.

## 13. Security Considerations
- **No Orphaned Records**: If the `clients` or `profiles` database insertions fail after creating the Auth user, the Server Action triggers `auth.admin.deleteUser()` to roll back the identity and prevent orphaned accounts.
- **Secret Scanning**: Audits confirm no secrets or service role keys are present in the frontend bundle.

## 14. Future SaaS Migration Path
- The database schema (`organization_id` on all major tables) natively supports multi-tenant SaaS.
- If Marketivity decides to open the platform to external agencies in the future, the only required addition is a public `/signup/agency` route that generates a new `organization` and assigns the `super_admin` role to the creator. The underlying database architecture requires zero changes.
