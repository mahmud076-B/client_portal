import { Suspense } from 'react';
import { getCurrentProfile } from '@/lib/supabase/auth';
import AssistantWidget from './AssistantWidget';

/** Server wrapper: renders the floating assistant only for signed-in users. */
export default async function AssistantMount() {
  const { profile } = await getCurrentProfile();
  if (!profile) return null;
  return (
    <Suspense fallback={null}>
      <AssistantWidget role={profile.role} firstName={profile.full_name?.split(' ')[0] ?? null} />
    </Suspense>
  );
}
