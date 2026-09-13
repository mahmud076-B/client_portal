'use client';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';

export default function AdminSidebar({ profile }: { profile: any }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Official_Logo.jpeg" alt="Marketivity Admin" style={{ filter: 'brightness(1.5)' }} />
        </div>
        <div className="sidebar-section-label">Admin Portal</div>
        <ul className="sidebar-nav">
          <li>
            <a href="/admin/dashboard" className={pathname === '/admin/dashboard' ? 'active' : ''} onClick={(e) => { e.preventDefault(); router.push('/admin/dashboard'); }}>
              <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
              Overview
            </a>
          </li>
          <li>
            <a href="/admin/clients" className={pathname.startsWith('/admin/clients') ? 'active' : ''} onClick={(e) => { e.preventDefault(); router.push('/admin/clients'); }}>
              <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
              Clients
            </a>
          </li>
          <li>
            <a href="/admin/meta" className={pathname.startsWith('/admin/meta') ? 'active' : ''} onClick={(e) => { e.preventDefault(); router.push('/admin/meta'); }}>
              <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg></span>
              Meta Connections
            </a>
          </li>
        </ul>
        <div className="sidebar-bottom">
          <div className="client-identity">
            <div className="client-avatar" style={{ background: 'var(--orange-500)', color: 'white' }}>
              {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <div>
              <div className="client-name">{profile?.full_name || 'Admin'}</div>
              <div className="client-company">Marketivity Internal</div>
            </div>
          </div>
          <a href="#" onClick={handleSignOut} className="logout-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </a>
        </div>
      </aside>

      <nav className="mobile-nav">
        <a href="/admin/dashboard" onClick={(e) => { e.preventDefault(); router.push('/admin/dashboard'); }} className={`mob-nav-item ${pathname === '/admin/dashboard' ? 'active' : ''}`}>
          Overview
        </a>
        <a href="/admin/clients" onClick={(e) => { e.preventDefault(); router.push('/admin/clients'); }} className={`mob-nav-item ${pathname.startsWith('/admin/clients') ? 'active' : ''}`}>
          Clients
        </a>
        <a href="/admin/meta" onClick={(e) => { e.preventDefault(); router.push('/admin/meta'); }} className={`mob-nav-item ${pathname.startsWith('/admin/meta') ? 'active' : ''}`}>
          Meta
        </a>
        <a href="#" onClick={handleSignOut} className="mob-nav-item">
          Sign Out
        </a>
      </nav>
    </>
  );
}
