# MARKETIVITY CLIENT PORTAL
# PHASE 2B — FINAL INVITATION ARCHITECTURE REVIEW
*Generated: 2026-09-13*

---

## 1. Official Supabase Findings
Based on the current official Supabase documentation for Next.js App Router and Server-Side Rendering (SSR):

- **A. `inviteUserByEmail()` & PKCE:** Admin API methods like `inviteUserByEmail` are server-to-server operations. They do not originate from a browser, so they cannot generate a PKCE `code_challenge`. Thus, they do not initiate a PKCE flow.
- **B. Default `ConfirmationURL` Behavior:** By default, Supabase email templates use `{{ .ConfirmationURL }}`. When clicked, Supabase validates the token and redirects the browser using an **Implicit Grant** flow. The secure session tokens are appended to the URL as a **hash fragment** (e.g., `#access_token=...`).
- **C. Next.js App Router Limitations:** Next.js Server Routes (like `app/auth/callback/route.ts`) execute on the Node.js server. HTTP protocols dictate that URL hash fragments (`#...`) are never sent to the server. Consequently, the server cannot read the token, assumes the authentication failed, and safely redirects to `/login`.
- **D. The Documented `token_hash` Pattern:** To solve this, Supabase strictly requires SSR applications to replace `{{ .ConfirmationURL }}` with a custom URL using `{{ .TokenHash }}`. This places the secure token in a query parameter (`?token_hash=...`) which the server *can* read, pass to `supabase.auth.verifyOtp()`, and use to establish a server-side session.
- **E. Expiration:** Invitation links expire based on the "Invite email expiration" setting in the Supabase Dashboard (typically 24 hours).

## 2. Final Invitation Architecture Decision
**DECISION: A. Native Supabase `token_hash` invitation flow.**

This is the only architecturally sound choice. It strictly adheres to official Supabase SSR guidelines, entirely avoids the vulnerability and unreliability of implicit hash fragments, and utilizes our existing secure Next.js Server Components without requiring custom token infrastructure.

## 3. Exact Email Template
To implement this architecture, the Supabase Dashboard Email Template (Authentication → Email Templates → Invite User) must be updated.

**Subject:** `You have been invited to Marketivity`
**Link Structure:**
```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/invite/accept">Accept Invitation</a>
```

**Why we use `next=/invite/accept` instead of `{{ .RedirectTo }}`:**
Our `auth/callback` route has a strict security guard (`ALLOWED_REDIRECT_PATHS`) that explicitly only allows relative paths like `/invite/accept`. Passing `next=/invite/accept` hardcodes this safe relative path directly into the template, entirely eliminating the risk of Open Redirect vulnerabilities that can occur if dynamic absolute URLs are passed via `redirectTo`.

## 4. Current Architecture & Callback Design
**File:** `app/auth/callback/route.ts`
**Status:** **[KEEP] (No changes required)**
Our existing callback is already perfectly designed for this new template. It explicitly extracts `token_hash` and `type`, calls `supabase.auth.verifyOtp()`, handles the session creation, enforces the `ALLOWED_REDIRECT_PATHS` array, and issues the `NextResponse.redirect` to `/invite/accept`. 

## 5. Session Cookie Architecture
1. The user clicks the email link containing the `token_hash`.
2. The request hits `app/auth/callback/route.ts`.
3. The server calls `supabase.auth.verifyOtp({ token_hash, type: 'invite' })`.
4. Supabase validates the token and returns a new session.
5. The `@supabase/ssr` client automatically catches this session and attaches `Set-Cookie` headers to the outgoing `NextResponse.redirect`.
6. The browser receives the 307 Redirect, saves the secure HTTP-only cookies, and navigates to `/invite/accept`.

## 6. Session Confusion Protection
**Scenario:** A user is already logged in as User A (e.g., an Admin), but clicks an invitation link intended for User B (Client).
**Native Supabase Behavior:** `verifyOtp()` successfully consumes the token and *replaces* the session cookies. The browser is now legitimately logged in as User B.
**Protection Design:** To prevent the human user from accidentally setting a password for the wrong account without realizing it, we will update `app/invite/accept/page.tsx` to visually display the email address of the active session. 
*(e.g., "Welcome! Please create a secure password for **marketivity.tryon@gmail.com**").*

## 7. Invite Accept Design
**File:** `app/invite/accept/page.tsx`
**Status:** **[CHANGE]**
- The session guard already ensures an authenticated user is present.
- We will retrieve `data.session.user.email` and display it in the UI to prevent session confusion.
- The `updateUser({ password })` and `refreshSession()` logic will remain exactly as is, as it is already correct.

## 8. Deployment Requirements
To test this in **production**, the following configuration must be exact:

**Application (`.env.local` or Vercel Environment Variables):**
- `NEXT_PUBLIC_SITE_URL=https://[YOUR_PRODUCTION_DOMAIN]`

**Supabase Dashboard (Authentication → URL Configuration):**
- **Site URL:** `https://[YOUR_PRODUCTION_DOMAIN]`
- **Redirect URLs:** `https://[YOUR_PRODUCTION_DOMAIN]/**`

*(For local testing, these values remain `http://localhost:3000`).*

## 9. Local vs Production Verification
- **Local:** We can verify the entire orchestration flow (Admin UI → Database records), the `auth/callback` logic (via magic links simulating the template), the `invite/accept` UI, and the final dashboard route.
- **Production:** A public deployment is strictly required to verify actual cross-browser email delivery. Because the Supabase Auth server injects `{{ .SiteURL }}`, clicking a live email link from a cloud Supabase project will only route correctly to a live public domain (or localhost if Supabase Site URL is currently hardcoded to localhost).

## 10. Exact Files to Change / Preserve
- **[CHANGE]** Supabase Dashboard: Invite User Email Template
- **[CHANGE]** `app/invite/accept/page.tsx`: Add email display for session confusion protection.
- **[PRESERVE]** `app/auth/callback/route.ts`: Already handles `token_hash`.
- **[PRESERVE]** `app/admin/clients/actions.ts`: Admin API orchestration is correct.
- **[PRESERVE]** `lib/supabase/auth.ts`: Route guards are correct.

## 11. Implementation Order
1. Update `app/invite/accept/page.tsx` to display the active user email.
2. The Owner manually updates the Supabase Email Template in the Supabase Dashboard.
3. The Owner performs the final End-to-End browser test.

## 12. Rollback Plan
If the `token_hash` template fails in production, the Owner simply reverts the Supabase Email Template back to `{{ .ConfirmationURL }}` in the Supabase Dashboard. No application code rollbacks are required as the callback natively supports both PKCE (`code`) and Email (`token_hash`) gracefully.
