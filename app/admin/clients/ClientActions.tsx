'use client';

import { useState } from 'react';
import { removeClient, removeAssignment, assignCampaign } from './actions';
import { Alert, Badge, Button, statusTone } from '@/components/ui';
import { deriveDeliveryStatus } from '@/lib/meta/results';
import Modal from '@/components/ui/Modal';

type Campaign = {
  id: string;
  name: string;
  status: string;
  effective_status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type Assignment = {
  campaign_id: string;
  created_at: string;
  campaigns: {
    name: string;
    status: string;
    meta_campaign_id: string;
  };
};

export default function ClientActions({
  clientId,
  clientName,
  isOrphan,
  allCampaigns,
  clientAssignments,
}: {
  clientId: string;
  clientName: string;
  isOrphan: boolean;
  allCampaigns: Campaign[];
  clientAssignments: Assignment[];
}) {
  const [showManage, setShowManage] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');

  // Unassigned campaigns for this specific client
  const unassignedCampaigns = allCampaigns.filter(
    (c) => !clientAssignments.some((a) => a.campaign_id === c.id)
  );

  const handleRemoveClient = async () => {
    setLoadingId('remove-client');
    setError(null);
    const res = await removeClient(clientId);
    if (res.error) setError(res.error);
    else setShowRemove(false);
    setLoadingId(null);
  };

  const handleRemoveAssignment = async (campaignId: string) => {
    setLoadingId(`remove-${campaignId}`);
    setError(null);
    const res = await removeAssignment(clientId, campaignId);
    if (res.error) setError(res.error);
    setLoadingId(null);
  };

  const handleAssignCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    
    setLoadingId('assign-campaign');
    setError(null);
    const res = await assignCampaign(clientId, selectedCampaign);
    if (res.error) setError(res.error);
    else setSelectedCampaign('');
    setLoadingId(null);
  };

  return (
    <div style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
      <Button size="sm" onClick={() => setShowManage(true)}>Manage access</Button>

      <Button size="sm" variant="ghost" onClick={() => setShowRemove(true)} title="Remove client" aria-label={`Remove ${clientName}`} style={{ color: 'var(--mk-danger)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </Button>

      {/* MANAGE ACCESS DIALOG */}
      {showManage && (
        <Modal onClose={() => setShowManage(false)} labelledBy="manage-title" maxWidth={600}>
          <div className="gx-card__head">
            <div>
              <div className="gx-card__title" id="manage-title" style={{ fontSize: '1.125rem' }}>Manage access: {clientName}</div>
              {isOrphan && <div style={{ marginTop: '.375rem' }}><Badge tone="danger">Orphaned portal access</Badge></div>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowManage(false)} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <Alert>{error}</Alert>}

            <span className="gx-eyebrow">Assigned campaigns</span>
            {clientAssignments.length === 0 ? (
              <p className="gx-hint" style={{ fontSize: '.875rem' }}>No campaigns currently assigned.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
                {clientAssignments.map(a => (
                  <div key={a.campaign_id} className="gx-glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '.875rem 1rem', borderRadius: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--mk-ink)', fontSize: '.9375rem' }}>{a.campaigns.name}</div>
                      <div className="gx-hint" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                        {(() => {
                          const c = allCampaigns.find((x) => x.id === a.campaign_id);
                          if (!c) return null;
                          const ds = deriveDeliveryStatus(c);
                          return <Badge tone={statusTone(ds.code)} dot live={ds.isLive} title={ds.description}>{ds.label}</Badge>;
                        })()}
                        <span>Assigned {new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => handleRemoveAssignment(a.campaign_id)} disabled={loadingId === `remove-${a.campaign_id}`}>
                      {loadingId === `remove-${a.campaign_id}` ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <span className="gx-eyebrow" style={{ marginTop: '.75rem' }}>Assign new campaign</span>
            <form onSubmit={handleAssignCampaign} style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <select
                className="gx-input"
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                style={{ flex: '1 1 240px', width: 'auto' }}
                aria-label="Campaign to assign"
              >
                <option value="">Select a campaign…</option>
                {unassignedCampaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({deriveDeliveryStatus(c).label})</option>
                ))}
              </select>
              <Button type="submit" variant="dark" disabled={!selectedCampaign || loadingId === 'assign-campaign'} style={{ minHeight: 48 }}>
                {loadingId === 'assign-campaign' ? 'Assigning…' : 'Assign'}
              </Button>
            </form>
          </div>
        </Modal>
      )}

      {/* REMOVE CLIENT DIALOG */}
      {showRemove && (
        <Modal onClose={() => setShowRemove(false)} labelledBy="remove-title">
          <div className="gx-card__head">
            <div className="gx-card__title" id="remove-title" style={{ fontSize: '1.125rem', color: 'var(--mk-danger)' }}>Remove client</div>
          </div>
          <p style={{ color: 'var(--mk-ink-2)', fontSize: '.9375rem', marginBottom: '1rem', lineHeight: 1.55 }}>
            Are you sure you want to remove <strong>{clientName}</strong>?
          </p>
          <ul style={{ color: 'var(--mk-muted)', fontSize: '.875rem', marginBottom: '1.5rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
            <li>Their portal access will be permanently revoked.</li>
            <li>All active campaign assignments will be removed.</li>
            <li><strong style={{ color: 'var(--mk-ink)' }}>Campaigns and historical performance data will remain intact.</strong></li>
          </ul>

          {error && <div style={{ marginBottom: '1rem' }}><Alert>{error}</Alert></div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem', flexWrap: 'wrap' }}>
            <Button onClick={() => setShowRemove(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleRemoveClient} disabled={loadingId === 'remove-client'} style={{ background: '#B91C1C', color: '#fff' }}>
              {loadingId === 'remove-client' ? 'Removing…' : 'Yes, remove client'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
