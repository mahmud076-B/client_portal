import '@/app/dashboard/dashboard.css';
import { requireAdmin } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import AdminShell from './AdminShell';
import AssistantMount from '@/components/ai/AssistantMount';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireAdmin();
  } catch (error) {
    redirect('/login');
  }

  return (
    <>
      <AdminShell profile={session.profile}>{children}</AdminShell>
      {/* Outside the shell so the fixed chat widget isn't inside glass/transformed containers. */}
      <AssistantMount />
    </>
  );
}
