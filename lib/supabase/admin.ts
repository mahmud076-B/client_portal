import { createClient } from '@supabase/supabase-js';

// Ensure this code is never bundled on the client
import 'server-only';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * A server-only Supabase client initialized with the SERVICE ROLE KEY.
 * 
 * WARNING: This client bypasses Row Level Security (RLS).
 * It must ONLY be used for server-side administrative tasks
 * where the user's authorization has ALREADY been independently verified.
 * 
 * NEVER expose this client or the service role key to the browser.
 */
export const createAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};
