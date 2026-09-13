'use server';

import { requireAdmin } from '@/lib/supabase/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function inviteClient(formData: FormData) {
  try {
    // 1. Validate Admin Authorization
    const { profile: adminProfile } = await requireAdmin();
    const organizationId = adminProfile.organization_id;

    if (!organizationId) {
      throw new Error("Admin profile is missing an organization_id.");
    }

    // 2. Extract and Validate Input
    const businessName = formData.get('businessName')?.toString().trim();
    const contactName = formData.get('contactName')?.toString().trim();
    const email = formData.get('email')?.toString().trim();

    if (!businessName || !contactName || !email) {
      return { error: 'All fields (Business Name, Contact Name, Email) are required.' };
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { error: 'Invalid email format.' };
    }

    // 3. Prevent duplicate clients (by email) within the organization
    const supabase = await createClient();
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .single();

    if (existingClient) {
      return { error: 'A client with this email already exists in your organization.' };
    }

    // 4. Invite User via Supabase Auth (Admin API)
    const adminSupabase = createAdminClient();
    
    // We send an invite link. The user will click the link, be verified, and prompted to set a password.
    let siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        siteUrl = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
      } else if (process.env.NODE_ENV === 'development') {
        siteUrl = 'http://localhost:3000';
      } else {
        throw new Error("NEXT_PUBLIC_SITE_URL is not configured for production environment.");
      }
    }

    const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/invite/accept`,
      data: {
        full_name: contactName,
        // We do NOT trust role/org_id from auth user metadata for security, 
        // they are strictly enforced in the public.profiles table.
      }
    });

    if (authError || !authData.user) {
      console.error("Auth Invite Error:", authError);
      return { error: 'Failed to send invitation email through Supabase.' };
    }

    const authUserId = authData.user.id;

    // 5. Create `public.clients` record using Admin context
    // We use the normal SSR client because RLS allows INSERT if organization_id matches (or we can use admin client if RLS insert policies aren't fully fleshed out for admin, but let's check).
    // Actually, Step 03 explicitly states: "Clients must NOT be able to create... admin users", but Admins CAN create clients.
    // To be perfectly safe against partial schema restrictions, and since we just created an Auth user (which the current request's JWT didn't create), 
    // it's safer to use the admin client for the system-level orchestration of profiles, 
    // OR we use the regular client. Let's try the regular client since `requireAdmin()` means we have a valid JWT with the right org.
    // Wait, the `profiles` table has a constraint: auth_user_id REFERENCES auth.users(id). 
    // Our regular user JWT can insert into `clients`. Let's use regular client for `clients` to ensure RLS is respected.
    
    // Actually, if we insert into `profiles` for a DIFFERENT user (the invited user), the admin's RLS policy might block inserting a profile for another user.
    // Let's use the adminSupabase client to guarantee insertion, since this is a protected Server Action running under `requireAdmin()`.
    // We are manually enforcing tenancy here.

    const { data: clientRecord, error: clientError } = await adminSupabase
      .from('clients')
      .insert({
        organization_id: organizationId,
        name: businessName,
        company_name: businessName,
        email: email,
        status: 'active'
      })
      .select()
      .single();

    if (clientError || !clientRecord) {
      console.error("Client Creation Error:", clientError);
      // Clean up orphaned auth user if database insertion fails
      await adminSupabase.auth.admin.deleteUser(authUserId);
      return { error: 'Failed to create client record. Invitation was cancelled.' };
    }

    // 6. Create `public.profiles` record using Admin context
    const { error: profileError } = await adminSupabase
      .from('profiles')
      .insert({
        auth_user_id: authUserId,
        organization_id: organizationId,
        client_id: clientRecord.id,
        role: 'client', // STRICTLY ENFORCED SERVER-SIDE
        full_name: contactName,
        email: email
      });

    if (profileError) {
      console.error("Profile Creation Error:", profileError);
      // Rollback
      await adminSupabase.from('clients').delete().eq('id', clientRecord.id);
      await adminSupabase.auth.admin.deleteUser(authUserId);
      return { error: 'Failed to create user profile. Invitation was cancelled.' };
    }

    revalidatePath('/admin/clients');
    return { success: true };
    
  } catch (error: any) {
    console.error("Invite Client Exception:", error);
    if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
       return { error: 'You are not authorized to perform this action.' };
    }
    return { error: 'An unexpected server error occurred.' };
  }
}
