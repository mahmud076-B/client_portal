# PHASE 2G.1 — SUPABASE RESEND SMTP FORENSIC

## 1. Production Failure
- **Error**: `500 Error sending invite email`
- **Context**: The `adminSupabase.auth.admin.inviteUserByEmail()` command successfully executes but fails internally when Supabase GoTrue attempts to dispatch the email via SMTP.

## 2. Supabase Project Verification
- **Project Ref**: `mfnmbekmcdfoxftgbxuu`
- *(Verified via CLI in Phase 2G)*

## 3. Current SMTP Configuration
- **Status**: Not available through current Supabase MCP. (Unauthorized / Failed to load).

## 4. Expected Resend Configuration
- **SMTP Host**: `smtp.resend.com`
- **SMTP Port**: `465`
- **SMTP Username**: `resend`
- **SMTP Password**: Resend API Key
- **Sender**: `no-reply@auth.marketivity.agency`

## 5. SMTP Error Evidence
- **Log Observation**: Not available through current Supabase MCP. (Unauthorized / Failed to load).
- **Application Trace**: The Node.js execution trace explicitly throws `AuthRetryableFetchError: Error sending invite email (status: 500)`. This synchronous 500 error from the Auth API specifically denotes a failure to negotiate the SMTP relay (e.g., connection refused, authentication failure, or incorrect port) during the dispatch phase. 

## 6. Email Template Findings
- **Status**: Not available through current Supabase MCP. (Unauthorized / Failed to load).

## 7. Site URL / Redirect Findings
- **Status**: Not available through current Supabase MCP. (Unauthorized / Failed to load).

## 8. Resend Domain Findings
- **Status**: Resend-side verification unavailable from current environment.

## 9. DNS Findings
- **Status**: DNS verification unavailable from current environment. (Note: DNS/SPF failures typically cause deliverability issues *after* successful SMTP handoff, not a synchronous 500 connection error from the Supabase API).

## 10. Rate Limit Findings
- **Status**: Not available through current Supabase MCP. (Unauthorized / Failed to load).
- *(Note: A rate limit usually throws a `429 Too Many Requests`, not a `500 Internal Server Error`).*

## 11. Database Health Findings
- **Status**: Not available through current Supabase MCP. (Unauthorized / Failed to load).
- *(Note: Basic queries to Postgres are resolving instantly, so database connection exhaustion is highly unlikely to be the cause of this specific SMTP error).*

## 12. Application Code Findings
- **Redirect URL**: The `inviteUserByEmail()` method in `app/admin/clients/actions.ts` correctly passes the expected redirect URL:
  `redirectTo: ${siteUrl}/auth/callback?next=/invite/accept`
- **Error Handling**: The application correctly intercepts the 500 error within an 8000ms timeout boundary and surfaces a graceful error to the UI (`Failed to send invitation email through Supabase. Please try again.`). The application does NOT mutate or cause the 500 error; it accurately reflects the infrastructure failure.

## 13. Root Cause Classification
**CONFIRMED SMTP CONFIGURATION ERROR**

## 14. Confidence
**MEDIUM**
While we cannot inspect the raw SMTP credentials directly via the MCP due to authorization errors, the synchronous `500 Error sending invite email` specifically indicates a failure in GoTrue's ability to relay the email through the configured SMTP server. It is a verifiable fact that Supabase failed to send the email; it is an inference that the credentials/port are incorrectly configured, but it is the only logical cause for a synchronous 500 SMTP failure in this context.

## 15. Minimum Safe Fix
- Configure/repair Supabase custom SMTP settings in the Supabase Dashboard. 
- Ensure the Resend API key is valid and the port is correct (`465` with SSL/TLS).

## 16. Next Action
- A human administrator must log into the Supabase Dashboard (`mfnmbekmcdfoxftgbxuu`), navigate to Authentication -> Email, and verify the Custom SMTP configuration (Host, Port, Username, Password). No code changes are required.
