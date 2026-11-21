import { Suspense } from 'react';
import { getCurrentProfile } from '@/lib/supabase/auth';
import { getOpenAIConfig } from '@/lib/ai/config';
import AssistantWidget from './AssistantWidget';

/** Server wrapper: renders the floating assistant only for signed-in users, and only once OPENAI_API_KEY is set. */
export default async function AssistantMount() {
  if (!getOpenAIConfig()) return null;
  const { profile } = await getCurrentProfile();
  if (!profile) return null;
  return (
    <Suspense fallback={null}>
      <AssistantWidget role={profile.role} firstName={profile.full_name?.split(' ')[0] ?? null} />
    </Suspense>
  );
}
