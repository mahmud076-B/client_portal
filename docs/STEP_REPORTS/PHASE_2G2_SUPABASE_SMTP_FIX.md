# PHASE 2G.2 — SUPABASE SMTP CONFIGURATION FIX

## 1. Confirmed Root Cause
- The Supabase GoTrue Auth API returned a `500 Error sending invite email` when executing `inviteUserByEmail`.
- This definitively points to a failure in the Supabase Custom SMTP configuration, as Supabase Auth is actively failing to relay outgoing emails via SMTP (Resend).

## 2. Previous SMTP Configuration
- **Status**: Not available via MCP (Unauthorized / Failed to load). 
- *Inference: Either the password (API Key) is missing/invalid, the port is incorrect (e.g., using 587 instead of 465), or custom SMTP was accidentally disabled.*

## 3. Correct SMTP Configuration
The required configuration for Resend on Supabase Auth is:
- **Enable Custom SMTP**: Toggle ON
- **Sender email**: `no-reply@auth.marketivity.agency` *(Must match the verified Resend domain)*
- **Sender name**: `Marketivity`
- **Host**: `smtp.resend.com`
- **Port**: `465`
- **User**: `resend`
- **Password**: `<Your Resend API Key>` *(Do NOT expose this in chat or source code)*

## 4. Supabase Changes Applied
- **Manual Intervention Required**: Because the Resend API Key is a sensitive secret and is not available to the agent (and MCP is unauthorized), this fix must be applied manually by a human administrator in the Supabase Dashboard. 

## 5. Verification
- **Status**: Pending human configuration.

## 6. Security Check
- No secrets were logged or exposed.
- No source code modifications were made.
- No invitations were sent.

## 7. Unchanged Systems
- Application source code: UNCHANGED
- Database schema: UNCHANGED
- RLS Policies: UNCHANGED
- Meta integration: UNCHANGED
- Email templates: UNCHANGED
- Vercel settings: UNCHANGED
- Site URL / Redirect settings: UNCHANGED

## 8. Remaining Risk
- The invitation workflow remains completely broken until the SMTP credentials are corrected in the Supabase Dashboard.

## 9. Next Step
- **Action for User**: Please log into the Supabase Dashboard for project `mfnmbekmcdfoxftgbxuu`.
- Navigate to **Authentication -> Email -> SMTP Settings**.
- Ensure Custom SMTP is enabled.
- Update the **Password** field with a valid Resend API Key.
- Verify the Host (`smtp.resend.com`), Port (`465`), User (`resend`), and Sender (`no-reply@auth.marketivity.agency`).
- Save the configuration.
- Once completed, authorize the agent to proceed to the next E2E test.
