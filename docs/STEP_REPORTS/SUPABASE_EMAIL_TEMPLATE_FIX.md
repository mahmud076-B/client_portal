# MARKETIVITY CLIENT PORTAL
# EMAIL TEMPLATE CONFIGURATION REQUIRED

The issue you are experiencing (landing on the login page when clicking the invite link in a new browser) is a **known architectural requirement** when using Next.js App Router (`@supabase/ssr`).

## The Root Cause
1. By default, Supabase's "Invite User" email template uses the `{{ .ConfirmationURL }}` variable.
2. When a user clicks this default link, Supabase verifies the invite on their server and redirects the user to your app with the secure session tokens hidden in the **URL Hash Fragment** (e.g., `#access_token=...`).
3. **Crucially:** Next.js Server-Side routes (like our `app/auth/callback/route.ts`) **cannot read URL hash fragments**. 
4. Because the server cannot see the hidden tokens in the hash, it assumes the link is invalid and redirects the user to the login page.

## The Solution
You must update the Supabase Email Template to send the `token_hash` directly as a URL parameter, which the server *can* read.

Please follow these exact steps in your Supabase Dashboard:

1. Go to your **Supabase Dashboard**.
2. Navigate to **Authentication** -> **Email Templates**.
3. Select the **Invite User** template.
4. Replace the default `<a href="{{ .ConfirmationURL }}">` link (or whatever the link structure is) with this exact URL structure:
   
   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/invite/accept">Accept Invitation</a>
   ```
   *(If you are using a raw text URL instead of an HTML button, just paste the URL portion: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/invite/accept`)*
   
5. Save the template.

## Why this fixes it:
By using `{{ .TokenHash }}`, the email link sends the secure token directly into our `app/auth/callback/route.ts` as a query parameter. Our code will intercept this token, securely generate a session on the server, and reliably route the user to `/invite/accept` with a fully authenticated session.

Once you have updated this template in Supabase, try generating one more test invitation. The link will now correctly route the user to the password setup page!
