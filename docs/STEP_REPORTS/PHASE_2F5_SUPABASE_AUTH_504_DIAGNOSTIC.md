# PHASE 2F.5 — SUPABASE AUTH 504 DIAGNOSTIC
*Generated: 2026-09-13*

## 1. Observed Error
A `504 Gateway Timeout` was recorded by Supabase on the `GET /auth/v1/user` endpoint at `2026-09-13T13:27:00.473Z`. The request was initiated by the Node.js environment (Vercel Serverless Function) for the active Admin user.

## 2. Application Call Path
A search of the application reveals that `supabase.auth.getUser()` is invoked in two primary layers:
1. **Middleware (`lib/supabase/middleware.ts:59`)**: Executes on every protected route request.
2. **Server-Side Auth Abstraction (`lib/supabase/auth.ts:31`)**: Executed via `getCurrentProfile()`, which is called by `requireAuth()`, which is called by `requireAdmin()`.

**Call Graph for a single page load (e.g., `/admin/clients`):**
- Browser Request
- → Next.js Middleware → `getUser()` (Network Request 1)
- → Next.js App Router begins
- → `app/admin/layout.tsx` → `requireAdmin()` → `getUser()` (Network Request 2)
- → `app/admin/clients/page.tsx` → `requireAdmin()` → `getUser()` (Network Request 3, potentially deduplicated by Next.js `fetch` cache, but still executed in the tree)

## 3. Log Correlation
The 504 error occurred at `13:27:00Z`. This correlates exactly with the time the Admin user was attempting to log in, navigate to `/admin/dashboard`, or open `/admin/clients` to begin the Phase 2G Real Invitation Test. The serverless function hung while awaiting authorization confirmation from Supabase.

## 4. Auth Log Findings
*(Note: Direct access to Supabase platform logs via MCP is not available in this environment. Analysis relies on the provided log.)*
The presence of a `504` on the Supabase side (Kong API Gateway) indicates that the GoTrue (Auth) service took too long to process the token verification and return the user object. This is a platform-side timeout, meaning the request reached Supabase but the backend failed to respond in time.

## 5. Postgres Findings
When GoTrue hangs on `GET /auth/v1/user`, it is almost always because it is waiting on a response from the Postgres database (verifying the token against `auth.users` and `auth.sessions`). Typical causes include connection exhaustion, CPU spikes, or lock contention in the database.

## 6. Resource Findings
Without direct Supabase dashboard metrics, we cannot definitively read CPU or RAM limits. However, free/hobby tier Supabase projects frequently experience "cold start" latency or micro-outages during database maintenance or high tenant load on shared infrastructure.

## 7. Auth Configuration Findings
No application-level configuration changes were made recently that would break the endpoint. The configuration relies entirely on standard `@supabase/ssr` patterns.

## 8. SSR Implementation Findings
The implementation correctly uses `getUser()` for secure server-side validation (instead of the easily spoofed `getSession()`).
**However, the implementation is inefficient:**
- `getCurrentProfile()` creates a new Supabase client and awaits `getUser()` every time it is called.
- It is not wrapped in React's `cache()`.
- Middleware does not pass the user context to the App Router (a known Next.js limitation), forcing the App Router to re-fetch the user immediately after middleware already fetched it.
This results in sequential, blocking network calls to Supabase Auth on every page load, compounding any minor platform latency into a massive Vercel timeout.

## 9. Root Cause Classification
**MIXED**
- **Infrastructure (Supabase):** The 504 itself is a Supabase platform failure (GoTrue/Postgres latency spike). A simple `GET /auth/v1/user` should resolve in milliseconds.
- **Application (Next.js):** The application drastically amplifies this risk by making redundant, sequential `getUser()` network calls during a single page navigation (Middleware → Layout → Page). If Supabase takes 3.5 seconds to respond, 3 sequential calls take 10.5 seconds, instantly triggering a Vercel 504 crash.

## 10. Recommended Next Action
**Do NOT refactor the architecture yet.**
Supabase free tier occasionally experiences transient latency spikes. Since this is an intermittent 504 and not a persistent 500 error, the immediate action is to **retry the smoke test** in the browser to see if the platform has recovered. 
If the 504 persists consistently, we must refactor `getCurrentProfile()` to use React `cache()` and optimize the middleware to reduce redundant network hops.

## 11. Final Verdict
MIXED
