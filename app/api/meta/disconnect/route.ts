import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
    try {
        // 1. Authorization
        const { profile } = await requireAdmin();

        // 2. Database cleanup
        const supabase = await createClient();
        
        // Due to RLS, they can only delete their own organization's connection
        const { error } = await supabase
            .from('meta_connections')
            .delete()
            .eq('organization_id', profile.organization_id);

        if (error) {
            console.error('Failed to disconnect Meta:', error);
            return new NextResponse('Database error', { status: 500 });
        }

        return NextResponse.redirect(new URL('/dashboard/admin/meta', req.url));

    } catch (error: any) {
        if (error.message === 'UNAUTHORIZED' || error.message === 'FORBIDDEN') {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        console.error('Meta Disconnect Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
