import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth';
import { exchangeCodeForToken, getLongLivedToken, getMetaUserId } from '@/lib/meta/server/oauth';
import { encryptToken } from '@/lib/meta/server/crypto';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    try {
        // 1. Authorization
        const { profile } = await requireAdmin();

        const searchParams = req.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        if (error) {
            return NextResponse.redirect(new URL(`/dashboard/admin/meta?error=${error}`, req.url));
        }

        // 2. CSRF Validation
        const cookieStore = await cookies();
        const savedState = cookieStore.get('meta_oauth_state')?.value;
        if (!state || !savedState || state !== savedState) {
            return NextResponse.redirect(new URL('/dashboard/admin/meta?error=invalid_state', req.url));
        }
        
        // Clear cookie
        cookieStore.delete('meta_oauth_state');

        if (!code) {
            return NextResponse.redirect(new URL('/dashboard/admin/meta?error=missing_code', req.url));
        }

        // 3. Exchange Tokens
        const origin = req.nextUrl.origin;
        const redirectUri = `${origin}/api/meta/callback`;
        
        const shortLivedToken = await exchangeCodeForToken(code, redirectUri);
        const longLivedToken = await getLongLivedToken(shortLivedToken);
        const metaUserId = await getMetaUserId(longLivedToken);

        // 4. Encrypt the token safely
        const encryptedData = encryptToken(longLivedToken);

        // 5. Persist to Supabase
        const supabase = await createClient();
        
        // Upsert into meta_connections for this organization
        // RLS ensures they can only insert for their own organization
        const { error: dbError } = await supabase
            .from('meta_connections')
            .upsert({
                organization_id: profile.organization_id,
                meta_user_id: metaUserId,
                encrypted_token: encryptedData.encryptedToken,
                auth_tag: encryptedData.authTag,
                iv: encryptedData.iv,
                status: 'connected',
                last_validated_at: new Date().toISOString()
            }, {
                onConflict: 'organization_id'
            });

        if (dbError) {
            console.error('Database Error storing Meta Connection:', dbError);
            return NextResponse.redirect(new URL('/dashboard/admin/meta?error=database_error', req.url));
        }

        // 6. Success Redirect
        return NextResponse.redirect(new URL('/dashboard/admin/meta?success=true', req.url));

    } catch (error: any) {
        if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        console.error('Meta Callback Error:', error);
        return NextResponse.redirect(new URL('/dashboard/admin/meta?error=internal_error', req.url));
    }
}
