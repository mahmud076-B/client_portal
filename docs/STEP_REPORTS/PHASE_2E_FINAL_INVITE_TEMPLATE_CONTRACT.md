# MARKETIVITY CLIENT PORTAL
# PHASE 2E — FINAL INVITE TEMPLATE CONTRACT CHECK
*Generated: 2026-09-13*

## 1. Current `inviteUserByEmail` Contract
In `app/admin/clients/actions.ts` (Line 61):
```typescript
const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${siteUrl}/auth/callback?next=/invite/accept`,
```
**Action:** The backend explicitly passes `https://client-portal-xi-khaki.vercel.app/auth/callback?next=/invite/accept` as the `redirectTo` argument to Supabase.

## 2. Callback Contract (`app/auth/callback/route.ts`)
The server-side route handler strictly parses the following `searchParams`:
- **`token_hash`**: **REQUIRED**. Passed into `verifyOtp()`.
- **`type`**: **REQUIRED**. Must be `invite` or `recovery`.
- **`next`**: **IGNORED/OVERRIDDEN** for invitations. 
  - *Trace (Line 35):* `if (type === 'invite' || type === 'recovery') { next = '/invite/accept'; }`
  - Regardless of what the `next` query parameter contains, the server strictly forces the final destination to `/invite/accept` for all invites.
- **`code`**: **IGNORED**. Used only for PKCE flows, which we are not using for email link invitations.
- **`redirect_to`**: **IGNORED**. Not parsed by our callback.

## 3. Template Comparison

**Option A:** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/invite/accept`
- Generates: `https://client-portal-xi-khaki.vercel.app/auth/callback?token_hash=xyz&type=invite&next=/invite/accept`
- Parses perfectly. `token_hash` and `type` are captured. `next` is captured but immediately safely overridden to `/invite/accept`.

**Option B:** `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite`
- Evaluates `{{ .RedirectTo }}` to the absolute URL passed by our backend: `https://client-portal-xi-khaki.vercel.app/auth/callback?next=/invite/accept`.
- Generates: `https://client-portal-xi-khaki.vercel.app/auth/callback?next=/invite/accept&token_hash=xyz&type=invite`
- Parses perfectly. Identical outcome to Option A.

**Verdict:** Both work flawlessly because the callback is extremely robust and overrides the `next` param securely. However, **Option A** is the explicit, foolproof standard recommended by Supabase documentation. It does not rely on the backend successfully passing an intact `redirectTo` via the Admin API, anchoring the entire flow securely to the pre-configured `SiteURL` in the Dashboard.

## 4. Exact Final Template Recommendation
You must paste this EXACT HTML string into the Supabase Dashboard (Authentication -> Email Templates -> Invite User):

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/invite/accept">Accept Invitation</a>
```

*(Note: If the dashboard editor is using raw text instead of HTML, just paste the `{{ .SiteURL }}...` URL portion).*

## 5. Why It Matches
This template injects the one-time `{{ .TokenHash }}` securely into the URL as a query parameter. When the user clicks it, our Next.js App Router intercepts the request at `/auth/callback`. It extracts `token_hash`, executes `supabase.auth.verifyOtp()`, establishes the secure HTTP-only cookies on the server side (`@supabase/ssr`), and performs an internal redirect.

## 6. Redirect Security
- **Destination Lock:** Because `route.ts` executes `if (type === 'invite') { next = '/invite/accept'; }`, it is impossible to hijack an invitation link to redirect a user to an external phishing URL or an unauthorized internal page.
- **Token Stripping:** The final navigation is a `NextResponse.redirect(new URL('/invite/accept', requestUrl.origin))`. The `token_hash` query parameter is deliberately omitted from this redirect. When the user lands on the password setup page, their URL bar is completely clean of tokens, preventing accidental leakage.
- **Session Preservation:** The SSR cookies are correctly injected into the redirect response headers. The session flawlessly survives the jump to `/invite/accept`.

## 7. Manual Supabase Steps
You are now cleared to perform the final manual steps:
1. Ensure **Site URL** is exactly: `https://client-portal-xi-khaki.vercel.app`
2. Update the **Invite User** template to the exact string provided in Section 4.
