import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_REDIRECT_PATHS = ['/invite/accept', '/dashboard', '/admin/dashboard'];

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  
  // 1. Resolve intended destination
  let next = requestUrl.searchParams.get('next');
  
  // 2. Validate redirect destination to prevent open redirects
  if (!next || !ALLOWED_REDIRECT_PATHS.includes(next)) {
    next = '/dashboard'; // Safe fallback
  }

  const supabase = await createClient();

  if (code) {
    // PKCE flow
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  } else if (token_hash && type) {
    // Email link flow (if not using PKCE redirect)
    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });
    if (!error) {
      if (type === 'invite' || type === 'recovery') {
         next = '/invite/accept';
      }
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // If there's an error or no valid auth parameters, redirect to login page with an error
  return NextResponse.redirect(new URL('/login?error=Invalid+or+expired+invitation+link', requestUrl.origin));
}
