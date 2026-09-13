import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth';
import { getOAuthUrl } from '@/lib/meta/server/oauth';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
    try {
        // 1. Authorization: Only admins can connect Meta accounts
        await requireAdmin();

        // 2. Generate secure CSRF state
        const state = crypto.randomBytes(32).toString('hex');

        // 3. Store state in HttpOnly Secure cookie
        const cookieStore = await cookies();
        cookieStore.set('meta_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 10, // 10 minutes valid
            path: '/',
        });

        // 4. Generate URL
        const origin = req.nextUrl.origin;
        const redirectUri = `${origin}/api/meta/callback`;
        const oauthUrl = getOAuthUrl(redirectUri, state);

        return NextResponse.redirect(oauthUrl);
    } catch (error: any) {
        if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        console.error('Meta Connect Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
