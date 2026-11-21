import { requireAdmin } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import ClientManager from './ClientManager';
import ClientActions from './ClientActions';
import { Badge, DataTable, EmptyState, GlassCard, KpiCard, PageHeader } from '@/components/ui';

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
      campaign_assignments ( count ),
      profiles ( id )
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

  // 4. Fetch all available campaigns and detailed assignments for Management
  const { data: allCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, effective_status, start_time, end_time, ad_accounts!inner(organization_id)')
    .eq('ad_accounts.organization_id', profile.organization_id)
    .order('name');

  const { data: assignmentsList } = await supabase
    .from('campaign_assignments')
    .select(`
      client_id, 
      campaign_id, 
      created_at, 
      campaigns!inner(name, status, meta_campaign_id),
      clients!inner(organization_id)
    `)
    .eq('clients.organization_id', profile.organization_id);

  const totalSpend = Object.values(clientSpendMap).reduce((a, b) => a + b, 0);
  const activeCount = (clients || []).filter((c) => c.status === 'active').length;
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="gx-stack">
      <PageHeader
        eyebrow="Clients"
        title="Client management"
        description="Invite and manage client access to their campaign reporting."
        actions={<ClientManager />}
      />

      <div className="gx-grid">
        <KpiCard label="Total clients" value={(clients || []).length} />
        <KpiCard label="Active" value={activeCount} foot="With portal access enabled" />
        <KpiCard label="Lifetime spend" value={money.format(totalSpend)} foot="Across assigned campaigns" />
      </div>

      <GlassCard flush>
        {(!clients || clients.length === 0) ? (
          <EmptyState
            title="No clients yet"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          >
            Add your first client to send them an invitation and start sharing campaign performance data.
          </EmptyState>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Client / Business</th>
                <th>Contact email</th>
                <th>Status</th>
                <th className="gx-num">Campaigns</th>
                <th className="gx-num">Total spend</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const isOrphan = !client.profiles || client.profiles.length === 0;
                const clientAssignments = (assignmentsList || []).filter(a => a.client_id === client.id);

                return (
                  <tr key={client.id}>
                    <td>
                      <div className="gx-strong" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                        {client.company_name}
                        {isOrphan && <Badge tone="danger">Orphaned</Badge>}
                      </div>
                      <div className="gx-muted">{client.name}</div>
                    </td>
                    <td>{client.email}</td>
                    <td>
                      <Badge tone={client.status === 'active' ? 'success' : 'neutral'} dot>
                        {client.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="gx-num">{client.campaign_assignments?.[0]?.count || 0}</td>
                    <td className="gx-num gx-strong">{money.format(clientSpendMap[client.id] || 0)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <ClientActions
                        clientId={client.id}
                        clientName={client.company_name || client.name}
                        isOrphan={isOrphan}
                        allCampaigns={allCampaigns || []}
                        clientAssignments={clientAssignments as any}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </GlassCard>
    </div>
  );
}
