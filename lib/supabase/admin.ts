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
      global: {
        fetch: async (url, options) => {
          let retries = 3;
          let lastError;
          
          const fetchOptions = options || {};
          fetchOptions.cache = 'no-store';

          while (retries > 0) {
            try {
              const res = await fetch(url, fetchOptions);

              if (res.status >= 500 && res.status < 600) {
                console.warn(`[Supabase Admin] Encountered ${res.status} on ${url}. Retries left: ${retries - 1}`);
                retries--;
                if (retries === 0) return res;
                await new Promise(r => setTimeout(r, (4 - retries) * 1000));
                continue;
              }

              return res;
            } catch (err) {
              console.warn(`[Supabase Admin] Fetch network error: ${err}. Retries left: ${retries - 1}`);
              lastError = err;
              retries--;
              if (retries === 0) throw lastError;
              await new Promise(r => setTimeout(r, (4 - retries) * 1000));
            }
          }
          throw lastError;
        }
      }
    }
  );
};
