# MARKETIVITY CLIENT PORTAL
# PHASE 2A — INVITATION FORENSIC AUDIT
*Generated: 2026-09-13 | Mode: READ-ONLY / AUDIT*

---

## 1. Current Invitation Architecture
The current architecture attempts to use Supabase's native `inviteUserByEmail` Admin API to send invitations. 
When an admin fills out the "Invite Client" form, the server action orchestration attempts to create an Auth user, send an email, and explicitly link `public.clients` and `public.profiles` records within a transaction-like sequence. 

## 2. Admin Invite Action
**File:** `app/admin/clients/actions.ts` (`inviteClient`)
- **Method:** `adminSupabase.auth.admin.inviteUserByEmail(email, { redirectTo: ... })`
- **RedirectTo:** `${siteUrl}/auth/callback?next=/invite/accept`
- **Site URL Source:** Uses `process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'`
- **Metadata Passed:** `full_name: contactName`
- **Profile/Client Creation:** Creates `public.clients` and then `public.profiles` via `adminSupabase`.
- **Rollback Behavior:** If profile creation fails, it deletes the `clients` record and deletes the auth user via `adminSupabase.auth.admin.deleteUser`.

## 3. Supabase Configuration
**Status: NOT AVAILABLE THROUGH MCP**
MCP does not expose authentication configuration endpoints (Site URL, allowed redirect URLs, PKCE toggles, or email templates). We can only verify that `NEXT_PUBLIC_SITE_URL` is **missing** from `.env.local`, which forces `siteUrl` to default to `http://localhost:3000`.

## 4. Email Template Status
**Status: EMAIL TEMPLATE NOT VERIFIED**
Cannot be inspected via MCP tools. We cannot determine if it uses `{{ .ConfirmationURL }}` or a hashed token fragment.

## 5. Actual Invitation URL Structure
**Status: NOT VERIFIED** (Requires test email)

## 6. Browser Redirect Trace
**Status: NOT VERIFIED** (Requires test email)

## 7. Callback Behavior
**File:** `app/auth/callback/route.ts`
- **CODE FLOW (PKCE):** 
  `code` → `supabase.auth.exchangeCodeForSession(code)` → redirects to `next` (defaults to `/dashboard`).
- **TOKEN HASH FLOW:**
  `token_hash` + `type` → `supabase.auth.verifyOtp` → if `type` is 'invite', forces `next = '/invite/accept'` → redirects to `next`.
- **Failure:** Missing or invalid tokens redirect to `/login?error=Invalid+or+expired+invitation+link`.

## 8. Invite Accept Behavior
**File:** `app/invite/accept/page.tsx`
- **Session Checked:** NO. The page is fully client-side and does not verify session existence before rendering the form.
- **`getUser()` Called:** NO.
- **Update Password:** Yes, it calls `supabase.auth.updateUser({ password })`.
- **Redirection:** On success, calls `supabase.auth.refreshSession()`, redirects to `/dashboard`, and calls `router.refresh()`.
- **Invitation Context Verification:** NO. Any authenticated user can visit this page and change their password.
- **Expired Invitation Check:** NO.

## 9. Exact Failure Point
**Classifications:**
- **CONFIRMED ROOT CAUSE 1 (Missing env variable):** `NEXT_PUBLIC_SITE_URL` is undefined in `.env.local`. The invite email's redirect link will point to `http://localhost:3000/auth/callback` by default, which breaks invitations sent from production/staging deployments.
- **CONFIRMED ROOT CAUSE 2 (Infinite Redirect Loop on Orphaned Users):** As observed in browser tests for a manually created user without a profile (`joy331456@gmail.com`), logging in triggers an infinite redirect loop. `/auth/redirect` bounces users with missing profiles to `/login?error=invalid_session`, but `middleware.ts` blindly redirects authenticated users on `/login` back to `/auth/redirect`. 
- **POSSIBLE ROOT CAUSE (Cookie Setting in Route Handler):** Calling `exchangeCodeForSession` in Next.js App Router Route Handlers can sometimes fail to forward the `Set-Cookie` headers if the `NextResponse.redirect` isn't properly inheriting the cookie changes from the `@supabase/ssr` server client.

## 10. Security Findings
- **Cross-user password modification:** Not directly vulnerable (requires their active session), but poor practice.
- **Open Redirect:** In `route.ts`, the `next` param is blindly appended to `requestUrl.origin`. This is partially safe (forces same-origin), but `next` can be manipulated to redirect authenticated users to unintended internal routes.
- **Privilege Escalation:** Prevented by server-side role enforcement in `actions.ts`.
- **Session Confusion:** `/invite/accept` relies on whatever session is active in the browser. If a different user is logged in when the link is clicked, the password update would apply to the wrong account.

## 11. Recommended Minimal Fix
1. **Fix the Infinite Redirect Loop:** Update `middleware.ts` to allow authenticated users to hit `/login?error=invalid_session` without instantly bouncing them to `/auth/redirect`, OR update `/auth/redirect` to force a sign-out if a profile is completely missing.
2. **Fix Site URL:** Explicitly define `NEXT_PUBLIC_SITE_URL` in the environment.
3. **Secure `/invite/accept`:** Convert the page to a Server Component (or add a layout guard) to ensure a valid session exists. Check that the user is actively in a state requiring password setup (e.g., checking if it's their first login or `last_sign_in_at` is null, though Supabase handles this natively via the invite token).
4. **Fix Callback Cookie Propagation:** Ensure that `route.ts` correctly pipes `Set-Cookie` headers when returning `NextResponse.redirect`, preventing dropped sessions after token exchange.

## 12. Alternative Architecture Only If Necessary
A completely custom token-based invitation system (storing an invite token in the database) is NOT necessary. Supabase's native invite flow is robust if the callback and `Site URL` configurations are correctly implemented.

## 13. Verification Requirements for Phase 2B
**TEST EMAIL ADDRESS REQUIRED.** 
We cannot complete steps 5, 6, and a true test of step 9 without a safe, controlled test email address to generate and capture a real Supabase invitation email. Please provide a safe test email address to complete the forensic trace.

---
**FINAL SAFETY CHECK CONFIRMATION:**
FILES MODIFIED: 0
DATABASE MODIFIED: 0
AUTH USERS CREATED: 0
AUTH USERS DELETED: 0
SUPABASE SETTINGS MODIFIED: 0
EMAIL TEMPLATE MODIFIED: 0
MIGRATIONS APPLIED: 0
META MODIFIED: 0
