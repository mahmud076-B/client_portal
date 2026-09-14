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

    // Vercel Serverless Functions (Hobby) have a strict 10s execution limit.
    // If Supabase's SMTP delivery takes longer than 10s, Vercel violently kills the process (504 Gateway Timeout),
    // causing an unhandled promise rejection in the Next.js client.
    // We use an 8000ms (8s) timeout to gracefully abort and return a serializable error BEFORE Vercel terminates the function.
    const invitePromise = adminSupabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/invite/accept`,
      data: {
        full_name: contactName,
      }
    });

    const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) => {
      setTimeout(() => reject(new Error('INVITE_TIMEOUT')), 8000);
    });

    let authData, authError;
    try {
      const result = await Promise.race([invitePromise, timeoutPromise]) as { data: any, error: any };
      authData = result.data;
      authError = result.error;
    } catch (e: any) {
      if (e.message === 'INVITE_TIMEOUT') {
        console.error("Auth Invite Timeout: Exceeded 8000ms.");
        return { error: 'Invitation status could not be confirmed. The system took too long to respond. Please check the client list in a few moments before retrying.' };
      }
      throw e;
    }

    if (authError || !authData?.user) {
      console.error("Auth Invite Error:", authError);
      
      // Handle case where user is already completely registered
      if (authError?.message?.toLowerCase().includes('already registered')) {
        return { error: 'This email is already registered in the system.' };
      }
      
      return { error: 'Failed to send invitation email through Supabase. Please try again.' };
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

export async function removeClient(clientId: string) {
  try {
    const { profile: adminProfile } = await requireAdmin();
    const organizationId = adminProfile.organization_id;

    if (!organizationId) throw new Error("Admin profile is missing an organization_id.");

    const adminSupabase = createAdminClient();

    // 1. Verify client belongs to Admin's organization
    const { data: client, error: fetchError } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('organization_id', organizationId)
      .single();

    if (fetchError || !client) {
      return { error: 'Client not found or you do not have permission to delete it.' };
    }

    // 2. Safely find the associated auth_user_id from profiles
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('auth_user_id')
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .single();

    // 3. Delete the Auth User (if it exists)
    if (profile && profile.auth_user_id) {
      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(profile.auth_user_id);
      if (authDeleteError) {
        console.error("Auth User Deletion Error:", authDeleteError);
        // Continue deleting the client row even if Auth delete fails (e.g., if already missing)
      }
    }

    // 4. Delete the public.clients record. 
    // This will CASCADE and securely delete campaign_assignments and profiles.
    const { error: clientDeleteError } = await adminSupabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('organization_id', organizationId);

    if (clientDeleteError) {
      console.error("Client Deletion Error:", clientDeleteError);
      return { error: 'Failed to delete client record from the database.' };
    }

    revalidatePath('/admin/clients');
    return { success: true };
  } catch (error: any) {
    console.error("Remove Client Exception:", error);
    return { error: 'An unexpected server error occurred during deletion.' };
  }
}

export async function assignCampaign(clientId: string, campaignId: string) {
  try {
    const { profile: adminProfile } = await requireAdmin();
    const organizationId = adminProfile.organization_id;

    if (!organizationId) throw new Error("Admin profile is missing an organization_id.");

    const adminSupabase = createAdminClient();

    // 1. Verify target client belongs to Admin's organization
    const { data: client, error: clientError } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('organization_id', organizationId)
      .single();

    if (clientError || !client) return { error: 'Invalid client.' };

    // 2. Verify target campaign belongs to an ad account in Admin's organization
    const { data: campaign, error: campaignError } = await adminSupabase
      .from('campaigns')
      .select('id, ad_accounts!inner(organization_id)')
      .eq('id', campaignId)
      .eq('ad_accounts.organization_id', organizationId)
      .single();

    if (campaignError || !campaign) return { error: 'Invalid campaign or unauthorized.' };

    // 3. Insert the assignment
    const { error: insertError } = await adminSupabase
      .from('campaign_assignments')
      .insert({
        client_id: clientId,
        campaign_id: campaignId
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return { error: 'This campaign is already assigned to this client.' };
      }
      console.error("Assign Campaign Error:", insertError);
      return { error: 'Failed to assign campaign.' };
    }

    revalidatePath('/admin/clients');
    return { success: true };
  } catch (error: any) {
    console.error("Assign Campaign Exception:", error);
    return { error: 'An unexpected server error occurred.' };
  }
}

export async function removeAssignment(clientId: string, campaignId: string) {
  try {
    const { profile: adminProfile } = await requireAdmin();
    const organizationId = adminProfile.organization_id;

    if (!organizationId) throw new Error("Admin profile is missing an organization_id.");

    const adminSupabase = createAdminClient();

    // We must ensure the assignment we are deleting belongs to a client in this organization
    const { data: client, error: clientError } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('organization_id', organizationId)
      .single();

    if (clientError || !client) return { error: 'Invalid client.' };

    const { error: deleteError } = await adminSupabase
      .from('campaign_assignments')
      .delete()
      .eq('client_id', clientId)
      .eq('campaign_id', campaignId);

    if (deleteError) {
      console.error("Remove Assignment Error:", deleteError);
      return { error: 'Failed to remove campaign assignment.' };
    }

    revalidatePath('/admin/clients');
    return { success: true };
  } catch (error: any) {
    console.error("Remove Assignment Exception:", error);
    return { error: 'An unexpected server error occurred.' };
  }
}
