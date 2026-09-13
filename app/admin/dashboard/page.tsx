export default function AdminDashboardPage() {
  return (
    <div>
      <div className="dash-header fade-up">
        <div>
          <h1 className="dash-greeting">Operations Overview</h1>
          <p className="dash-sub">Welcome to the Marketivity Admin Portal. Select an option to manage clients or Meta connections.</p>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem' }} className="fade-up">
        <a href="/admin/clients" style={{ padding: '2rem', background: 'white', borderRadius: '12px', border: '1px solid var(--c200)', textDecoration: 'none', color: 'inherit', boxShadow: 'var(--sh-md)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--c900)' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'var(--orange-100)', color: 'var(--orange-600)', borderRadius: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            Manage Clients
          </h2>
          <p style={{ color: 'var(--c500)', fontSize: '0.875rem', lineHeight: 1.5 }}>View organizations, client portals, and assign campaigns.</p>
        </a>

        <a href="/admin/meta" style={{ padding: '2rem', background: 'white', borderRadius: '12px', border: '1px solid var(--c200)', textDecoration: 'none', color: 'inherit', boxShadow: 'var(--sh-md)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--c900)' }}>
             <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'var(--orange-100)', color: 'var(--orange-600)', borderRadius: '8px' }}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
             </span>
            Meta Integration
          </h2>
          <p style={{ color: 'var(--c500)', fontSize: '0.875rem', lineHeight: 1.5 }}>Manage Facebook OAuth connections and sync ad accounts.</p>
        </a>
      </div>
    </div>
  );
}
