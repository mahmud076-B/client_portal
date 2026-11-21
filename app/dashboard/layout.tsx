import AssistantMount from '@/components/ai/AssistantMount';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AssistantMount />
    </>
  );
}
