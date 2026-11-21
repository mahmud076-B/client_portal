import { requireAdminPage } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import ClientManager from './ClientManager';
import ClientActions from './ClientActions';
import { Badge, DataTable, EmptyState, GlassCard, KpiCard, PageHeader, statusTone } from '@/components/ui';
import { deriveDeliveryStatus, summarizeDeliveryStatus } from '@/lib/meta/results';

export const metadata = {
  title: 'Client Management — Marketivity',
};

export default async function ClientsPage() {
  // 1. Enforce Admin Authorization
  const { profile } = await requireAdminPage();

  // 2. All reads in parallel (they were 5 sequential round-trips).
  const supabase = await createClient();
  const [
    { data: clients, error },
    { data: allCampaigns },
    { data: assignmentsList },
  ] = await Promise.all([
    supabase
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
      .order('created_at', { ascending: false }),
    supabase
      .from('campaigns')
      .select('id, name, status, effective_status, start_time, end_time, ad_accounts!inner(organization_id, currency)')
      .eq('ad_accounts.organization_id', profile.organization_id)
      .order('name'),
    supabase
      .from('campaign_assignments')
      .select(`
        client_id,
        campaign_id,
        created_at,
        campaigns!inner(name, status, meta_campaign_id),
        clients!inner(organization_id)
      `)
      .eq('clients.organization_id', profile.organization_id),
  ]);

  if (error) {
    console.error("Error fetching clients:", error);
  }

  // 3. Spend per client: only the assigned campaigns' insight rows (was: every insight row in the DB).
  const assignedCampaignIds = [...new Set((assignmentsList || []).map((a) => a.campaign_id as string))];
  const { data: insights } = assignedCampaignIds.length
    ? await supabase.from('campaign_insights').select('campaign_id, spend').in('campaign_id', assignedCampaignIds)
    : { data: [] as { campaign_id: string; spend: number | null }[] };

  const campaignSpendMap: Record<string, number> = {};
  for (const i of insights || []) {
    campaignSpendMap[i.campaign_id] = (campaignSpendMap[i.campaign_id] || 0) + Number(i.spend || 0);
  }
  const clientSpendMap: Record<string, number> = {};
  for (const a of assignmentsList || []) {
    clientSpendMap[a.client_id] = (clientSpendMap[a.client_id] || 0) + (campaignSpendMap[a.campaign_id] || 0);
  }

  // 4. Campaign delivery status per client, from the ONE shared status function.
  const campaignById = new Map((allCampaigns || []).map((c) => [c.id as string, c]));
  const clientCampaignStatus = (clientId: string) =>
    summarizeDeliveryStatus(
      (assignmentsList || [])
        .filter((a) => a.client_id === clientId)
        .map((a) => campaignById.get(a.campaign_id as string))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
    );
  const liveCampaigns = (allCampaigns || []).filter((c) => deriveDeliveryStatus(c).isLive).length;

  const totalSpend = Object.values(clientSpendMap).reduce((a, b) => a + b, 0);
  const accessCount = (clients || []).filter((c) => c.status === 'active').length;
  // Spend is stored in each ad account's currency; all Marketivity accounts report in one currency.
  const currencies = [...new Set((allCampaigns || []).map((c: any) => (Array.isArray(c.ad_accounts) ? c.ad_accounts[0] : c.ad_accounts)?.currency).filter(Boolean))];
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencies.length === 1 ? String(currencies[0]) : 'USD' });

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
        <KpiCard label="Live campaigns" value={liveCampaigns} foot="Delivering right now" />
        <KpiCard label="Portal access" value={accessCount} foot="Clients who can sign in" />
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
                <th>Campaign status</th>
                <th>Portal access</th>
                <th className="gx-num">Campaigns</th>
                <th className="gx-num">Total spend</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const isOrphan = !client.profiles || client.profiles.length === 0;
                const clientAssignments = (assignmentsList || []).filter(a => a.client_id === client.id);
                const delivery = clientCampaignStatus(client.id);

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
                      {delivery ? (
                        <Badge tone={statusTone(delivery.code)} dot live={delivery.isLive} title={delivery.description}>
                          {delivery.label}
                        </Badge>
                      ) : (
                        <span className="gx-muted">No campaigns</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={client.status === 'active' ? 'info' : 'neutral'}>
                        {client.status === 'active' ? 'Enabled' : 'Disabled'}
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
