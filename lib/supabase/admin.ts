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

          while (retries > 0) {
            try {
              // In Vercel serverless functions, Node's native fetch caches TCP keep-alive connections.
              // When the function is suspended and resumed, the connection is often dead, causing Gateway Timeouts (504)
              // or socket hang ups. We disable keepalive to force a fresh connection per request.
              const res = await fetch(url, { 
                ...options, 
                cache: 'no-store',
                keepalive: false 
              });

              // If we get a 5xx error (like 504 Gateway Timeout or 502 Bad Gateway), it might be a transient 
              // PostgREST/Supabase load balancer issue. We should retry.
              if (res.status >= 500 && res.status < 600) {
                console.warn(`[Supabase Admin] Encountered ${res.status} on ${url}. Retries left: ${retries - 1}`);
                retries--;
                if (retries === 0) return res;
                // Exponential backoff
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
