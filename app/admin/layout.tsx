import '@/app/dashboard/dashboard.css';
import { requireAdminPage } from '@/lib/supabase/auth';
import AdminShell from './AdminShell';
import AssistantMount from '@/components/ai/AssistantMount';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminPage();

  return (
    <>
      <AdminShell profile={session.profile}>{children}</AdminShell>
      {/* Outside the shell so the fixed chat widget isn't inside glass/transformed containers. */}
      <AssistantMount />
    </>
  );
}
