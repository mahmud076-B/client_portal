import { requireAdmin } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import ClientManager from './ClientManager';

export const metadata = {
  title: 'Client Management — Marketivity',
};

export default async function ClientsPage() {
  // 1. Enforce Admin Authorization
  const { profile } = await requireAdmin();

  // 2. Fetch Clients for the Admin's Organization
  const supabase = await createClient();
  const { data: clients, error } = await supabase
    .from('clients')
    .select(`
      id,
      name,
      company_name,
      email,
      status,
      created_at,
      campaign_assignments ( count )
    `)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching clients:", error);
  }

  // 3. Fetch insights to calculate total spend per client
  const { data: assignments } = await supabase
    .from('campaign_assignments')
    .select('client_id, campaign_id');

  const { data: insights } = await supabase
    .from('campaign_insights')
    .select('campaign_id, spend');

  const clientSpendMap: Record<string, number> = {};
  
  if (assignments && insights) {
     const campaignSpendMap: Record<string, number> = {};
     insights.forEach(i => {
         campaignSpendMap[i.campaign_id] = (campaignSpendMap[i.campaign_id] || 0) + Number(i.spend || 0);
     });
     
     assignments.forEach(a => {
         clientSpendMap[a.client_id] = (clientSpendMap[a.client_id] || 0) + (campaignSpendMap[a.campaign_id] || 0);
     });
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--fh)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--c900)', margin: '0 0 0.5rem 0' }}>
            Client Management
          </h1>
          <p style={{ color: 'var(--c500)', fontSize: '0.9375rem', margin: 0 }}>
            Invite and manage client access to their campaign reporting.
          </p>
        </div>
      </div>

      <ClientManager />

      <div style={{ background: 'var(--white)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-sm)', overflow: 'hidden', border: '1px solid var(--c200)' }}>
        {(!clients || clients.length === 0) ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--c100)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: 'var(--c400)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3 style={{ fontFamily: 'var(--fh)', fontSize: '1.125rem', fontWeight: 700, color: 'var(--c900)', margin: '0 0 0.5rem 0' }}>No clients yet</h3>
            <p style={{ color: 'var(--c500)', fontSize: '0.9375rem', margin: 0, maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
              Add your first client to send them an invitation and start sharing campaign performance data.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c200)', background: 'var(--c50)' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--c500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client / Business</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--c500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Email</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--c500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--c500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Campaigns</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--c500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spend</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--c500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Added On</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} style={{ borderBottom: '1px solid var(--c100)' }}>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--c900)', fontSize: '0.9375rem', marginBottom: '0.25rem' }}>{client.company_name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--c500)' }}>{client.name}</div>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', fontSize: '0.875rem', color: 'var(--c600)' }}>
                    {client.email}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <span style={{ 
                      display: 'inline-flex', alignItems: 'center', 
                      background: client.status === 'active' ? '#ECFDF5' : '#F3F4F6', 
                      color: client.status === 'active' ? '#047857' : '#4B5563', 
                      padding: '0.25rem 0.625rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600 
                    }}>
                      {client.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', fontSize: '0.875rem', color: 'var(--c600)' }}>
                    {client.campaign_assignments?.[0]?.count || 0}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', fontSize: '0.875rem', color: 'var(--c900)', fontWeight: 500 }}>
                    ${(clientSpendMap[client.id] || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', fontSize: '0.875rem', color: 'var(--c500)' }}>
                    {new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
