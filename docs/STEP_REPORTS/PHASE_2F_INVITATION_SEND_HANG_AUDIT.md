# MARKETIVITY CLIENT PORTAL
# PHASE 2F — INVITATION SEND HANG FORENSIC AUDIT
*Generated: 2026-09-13*

## 1. Symptom
In production, the Admin portal UI gets stuck permanently on "Sending..." when inviting a client. No success or error message is displayed, and Supabase logs show no relevant errors.

## 2. Client Form Flow (`ClientManager.tsx`)
1. User clicks "Send Invitation".
2. `handleSubmit` prevents default.
3. `setLoading(true)` sets UI to "Sending...".
4. `const result = await inviteClient(formData);` initiates the Server Action.
5. `setLoading(false)` executes.
6. Handles `result.error` or `result.success`.

**Critical Finding:** The `await inviteClient(formData)` call is **not** wrapped in a `try/finally` block. In Next.js, if a Server Action fails at the network layer (e.g., HTTP 504 Gateway Timeout or 500 Internal Server Error) instead of returning a serialized error object, the client-side fetch throws an unhandled Promise Rejection. This immediately aborts the `handleSubmit` execution, completely bypassing `setLoading(false)`.

## 3. Server Action Flow (`actions.ts`)
1. `requireAdmin()`
2. Input validation
3. Database `SELECT` (check duplicate client)
4. `adminSupabase.auth.admin.inviteUserByEmail()`
5. Database `INSERT` (clients)
6. Database `INSERT` (profiles)
7. `revalidatePath()`
8. Return `{ success: true }`

The entire server execution is wrapped in a `try { ... } catch (error: any) { return { error: '...' } }` block. This means any *synchronous or handled async error* within the Node.js process is caught and safely returned to the client as an object.

## 4. All Async Operations
- `await requireAdmin()` (Resolves or throws safe error)
- `await createClient()` (Synchronous-ish cookie resolution)
- `await supabase.from('clients').select(...).single()` (Resolves or returns `{error}`)
- `await adminSupabase.auth.admin.inviteUserByEmail(...)` (Network call to Supabase Auth)
- `await adminSupabase.from('clients').insert(...)` (Network call)
- `await adminSupabase.from('profiles').insert(...)` (Network call)

## 5. Exact Hang Point

THE INVITATION FLOW HANGS AT:
**Client-side:** The unhandled promise rejection of `await inviteClient(formData)` in `ClientManager.tsx`. [**CONFIRMED**]
**Server-side:** The underlying cause is the Server Action timing out (exceeding Vercel's execution limits) while waiting for `await adminSupabase.auth.admin.inviteUserByEmail(email, ...)`. [**LIKELY**]

## 6. Supabase Admin Client Review
`lib/supabase/admin.ts` correctly initializes a server-only client using `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It does not persist sessions. The client itself is safe, but it relies on Node.js `fetch` which inherits the platform execution constraints.

## 7. SMTP Isolation Analysis
When `inviteUserByEmail()` is called, Supabase Auth actively blocks the HTTP response until the underlying SMTP server accepts the email. If the SMTP server is slow, unresponsive, or rate-limiting, the Supabase API call takes a significant amount of time. 

## 8. Database Operation Analysis
The `INSERT` queries for `clients` and `profiles` are straightforward and highly unlikely to hang indefinitely. Row Level Security is bypassed by the admin client, so permissions are not a blocking factor.

## 9. Error Propagation Analysis
If the Supabase API returned a clean error (e.g., "Rate limit exceeded"), the `await` would resolve with `{ error }`, our server action would handle it, and the UI would gracefully show the error. Because it hangs, it means the API is *not* returning an error before Vercel intervenes.

## 10. Pending State Analysis
The UI state machine is: `IDLE -> SENDING -> (SUCCESS | ERROR)`. 
However, because of the unhandled promise rejection, it gets trapped in the `SENDING` state permanently. There is no timeout or fallback to `IDLE`.

## 11. Vercel Production Analysis
Vercel serverless functions have a strict execution timeout (default 10s - 15s for Hobby/Pro tiers). If Supabase Auth takes 11 seconds to communicate with a slow SMTP provider, Vercel violently kills the Server Action process and returns a 504 Gateway Timeout to the browser. Next.js throws an error on the client, breaking the UI state.

## 12. Supabase Log Evidence
The absence of a Supabase error log corroborates this theory. If Vercel drops the connection at 10s, Supabase may still be waiting on the SMTP provider internally, or it might silently discard the response when it eventually finishes because the client (Vercel) already disconnected.

## 13. Root Cause
1. **Infrastructure:** `inviteUserByEmail()` is taking longer than the Vercel Serverless Function timeout (likely due to SMTP latency or Supabase default rate limits).
2. **UI Architecture:** `ClientManager.tsx` fails to wrap the Server Action invocation in a `try/finally` block, leaving the application visually trapped in a loading state when network-level failures occur.

## 14. Minimal Recommended Fix
**A. Client Pending-State Bug Fix (Mandatory UI fix):**
Wrap the Server Action call in `try/finally` to guarantee state reset on network failure.
```typescript
try {
  const result = await inviteClient(formData);
  if (result?.error) setError(result.error);
  else if (result?.success) setSuccess('...');
} catch (err) {
  setError("A network error occurred or the request timed out.");
} finally {
  setLoading(false);
}
```

**B. Supabase Admin Invite Call Issue (Infrastructure fix):**
Investigate the SMTP provider latency. If using Supabase's default rate-limited SMTP, you must configure a custom SMTP provider (Resend, SendGrid) in the Supabase Dashboard to ensure lightning-fast invitation delivery that beats Vercel's timeout.

## 15. Verification Plan
1. Implement the `try/finally` block in `ClientManager.tsx`.
2. Push to Vercel.
3. Test the invitation again. The UI should now display "A network error occurred..." instead of hanging indefinitely. 
4. Configure a custom SMTP provider in Supabase to resolve the underlying latency/delivery issue.
