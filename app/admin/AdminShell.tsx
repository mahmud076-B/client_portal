'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BrandMark } from '@/components/ui';

type NavItem = { href: string; label: string; match: (p: string) => boolean; icon: ReactNode };

const NAV: NavItem[] = [
  {
    href: '/admin/dashboard',
    label: 'Overview',
    match: (p) => p === '/admin/dashboard',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>,
  },
  {
    href: '/admin/clients',
    label: 'Clients',
    match: (p) => p.startsWith('/admin/clients'),
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  },
  {
    href: '/admin/meta',
    label: 'Meta Connections',
    match: (p) => p.startsWith('/admin/meta'),
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  },
];

const TITLES: Array<[string, string]> = [
  ['/admin/clients', 'Clients'],
  ['/admin/meta', 'Meta Connections'],
  ['/admin/dashboard', 'Overview'],
];

export default function AdminShell({ profile, children }: { profile: { full_name?: string | null } | null; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const initials = profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD';
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Admin Portal';

  // Close the drawer on navigation and on Escape; lock body scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <aside className={`sidebar ${open ? 'mobile-open' : ''}`} id="sidebar" aria-label="Admin navigation">
        <div className="sidebar-brand">
          <BrandMark tagline="Admin Portal" href="/admin/dashboard" />
          <button type="button" className="sidebar-close-btn" onClick={() => setOpen(false)} aria-label="Close navigation">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="sidebar-section-label">Workspace</div>
        <ul className="sidebar-nav">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={item.match(pathname) ? 'active' : ''} aria-current={item.match(pathname) ? 'page' : undefined}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="sidebar-bottom">
          <div className="client-identity">
            <div className="client-avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="client-name">{profile?.full_name || 'Admin'}</div>
              <div className="client-company">Marketivity Internal</div>
            </div>
          </div>
          <button type="button" onClick={handleSignOut} className="logout-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      <div className={`mobile-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden />

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="hamburger" aria-label="Open navigation" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen((v) => !v)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>
            </button>
            <span className="page-title">{title}</span>
          </div>
          <div className="topbar-right">
            <span className="gx-badge gx-badge--brand">Admin</span>
            <div className="topbar-avatar" title={profile?.full_name || 'Admin'}>{initials}</div>
          </div>
        </header>
        <main className="content gx-admin">{children}</main>
      </div>
    </>
  );
}
