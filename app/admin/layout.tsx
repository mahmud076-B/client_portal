import '@/app/dashboard/dashboard.css';
import { requireAdmin } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import AdminSidebar from './AdminSidebar';

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

  const { profile } = session;

  return (
    <>
      <AdminSidebar profile={profile} />
      <div className="mobile-overlay" id="mobileOverlay"></div>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger" id="hamburger" aria-label="Toggle navigation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <span className="page-title">Admin Portal</span>
          </div>
          <div className="topbar-right">
            <div className="topbar-avatar" style={{ background: 'var(--orange-500)', color: 'white' }}>
              {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD'}
            </div>
          </div>
        </header>
        <main className="content">
          {children}
        </main>
      </div>
    </>
  );
}
