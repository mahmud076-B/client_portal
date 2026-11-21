import { requireAdmin } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { dhakaHour, greetingForHour } from '@/lib/ui/greeting';
import { deriveDeliveryStatus } from '@/lib/meta/results';
import { GlassLinkCard, KpiCard, PageHeader, ButtonLink } from '@/components/ui';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('en-US');

function greeting(date = new Date()) {
  return greetingForHour(dhakaHour(date));
}

async function loadCounts(organizationId: string | null) {
  if (!organizationId) return null;
  try {
    const supabase = await createClient();
    const [clients, accounts, campaigns, activeRows] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('ad_accounts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('campaigns').select('id, ad_accounts!inner(organization_id)', { count: 'exact', head: true }).eq('ad_accounts.organization_id', organizationId),
      supabase.from('campaigns').select('status, effective_status, start_time, end_time, ad_accounts!inner(organization_id)').eq('ad_accounts.organization_id', organizationId),
    ]);
    // "Active" = actually delivering, from the shared status function (same as every other screen).
    const active = (activeRows.data || []).filter((c) => deriveDeliveryStatus(c).isLive).length;
    return { clients: clients.count ?? 0, accounts: accounts.count ?? 0, campaigns: campaigns.count ?? 0, active };
  } catch {
    return null;
  }
}

const Icon = {
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  link: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  layers: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  pulse: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  arrow: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
};

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin();
  const counts = await loadCounts(profile.organization_id);
  const firstName = profile.full_name?.split(' ')[0] || 'there';
  const show = (n?: number) => (counts ? nf.format(n ?? 0) : '—');

  return (
    <div className="gx-stack">
      <PageHeader
        eyebrow="Operations"
        title={<>{greeting()}, <span className="gx-accent">{firstName}</span></>}
        description="Here's the pulse of the Marketivity client portal: clients, connected ad accounts and live campaigns."
        actions={<><ButtonLink href="/admin/meta">Meta connections</ButtonLink><ButtonLink href="/admin/clients" variant="primary">Manage clients</ButtonLink></>}
      />

      <div className="gx-grid">
        <KpiCard label="Clients" value={show(counts?.clients)} icon={Icon.users} foot="Organizations with portal access" />
        <KpiCard label="Ad accounts" value={show(counts?.accounts)} icon={Icon.link} foot="Registered from Meta" />
        <KpiCard label="Campaigns" value={show(counts?.campaigns)} icon={Icon.layers} foot="Synced into the portal" />
        <KpiCard label="Active now" value={show(counts?.active)} icon={Icon.pulse} foot="Delivering on Meta" />
      </div>

      <div className="gx-grid gx-grid--wide">
        <GlassLinkCard href="/admin/clients">
          <div className="gx-tile__icon">{Icon.users}</div>
          <div className="gx-tile__title">Manage clients <span className="gx-tile__arrow">{Icon.arrow}</span></div>
          <p className="gx-tile__desc">Invite organizations, control portal access and assign campaigns to each client.</p>
        </GlassLinkCard>
        <GlassLinkCard href="/admin/meta">
          <div className="gx-tile__icon">{Icon.link}</div>
          <div className="gx-tile__title">Meta integration <span className="gx-tile__arrow">{Icon.arrow}</span></div>
          <p className="gx-tile__desc">Keep the Meta Business connection healthy, register ad accounts and sync campaigns.</p>
        </GlassLinkCard>
      </div>
    </div>
  );
}
