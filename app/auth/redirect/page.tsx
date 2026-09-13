import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/auth';

export default async function AuthRedirect() {
  const { profile } = await getCurrentProfile();

  if (!profile) {
    redirect('/login?error=invalid_session');
  }

  if (profile.role === 'admin' || profile.role === 'super_admin') {
    redirect('/admin/dashboard');
  } else if (profile.role === 'client') {
    redirect('/dashboard');
  }

  redirect('/login?error=invalid_role');
}
