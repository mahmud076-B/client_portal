import { createClient } from './server';

export type UserRole = 'super_admin' | 'admin' | 'client';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  client_id: string | null;
  organization_id: string | null;
}

export interface ClientRecord {
  id: string;
  name: string;
  company_name: string | null;
}

/**
 * Retrieves the current authenticated user and their business profile.
 * Server-side only.
 */
export async function getCurrentProfile(): Promise<{
  user: any;
  profile: UserProfile | null;
  client: ClientRecord | null;
}> {
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return { user: null, profile: null, client: null };
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .single();

  if (profileError || !profileData) {
    return { user: authData.user, profile: null, client: null };
  }

  let clientData = null;
  if (profileData.role === 'client' && profileData.client_id) {
    const { data: clientRes, error: clientErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', profileData.client_id)
      .single();
    
    if (!clientErr && clientRes) {
      clientData = clientRes;
    }
  }

  return {
    user: authData.user,
    profile: profileData as UserProfile,
    client: clientData as ClientRecord,
  };
}

/**
 * Convenience helper to enforce that the user is authenticated.
 * Returns the profile or throws an error if unauthorized.
 */
export async function requireAuth() {
  const result = await getCurrentProfile();
  if (!result.user || !result.profile) {
    throw new Error('UNAUTHORIZED');
  }
  return result as {
    user: any;
    profile: UserProfile;
    client: ClientRecord | null;
  };
}

/**
 * Enforces that the authenticated user has one of the allowed roles.
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const result = await requireAuth();
  if (!allowedRoles.includes(result.profile.role)) {
    throw new Error('FORBIDDEN');
  }
  return result;
}

/**
 * Enforces that the user is an admin or super_admin.
 */
export async function requireAdmin() {
  return requireRole(['admin', 'super_admin']);
}

/**
 * Enforces that the user is a client.
 */
export async function requireClient() {
  const result = await requireRole(['client']);
  if (!result.client) {
    throw new Error('FORBIDDEN_NO_CLIENT_RECORD');
  }
  return {
    user: result.user,
    profile: result.profile,
    client: result.client, // guaranteed non-null
  };
}
