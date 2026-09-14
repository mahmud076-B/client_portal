'use client';

import { useState } from 'react';
import { removeClient, removeAssignment, assignCampaign } from './actions';

type Campaign = {
  id: string;
  name: string;
  status: string;
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
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <button
        onClick={() => setShowManage(true)}
        style={{
          background: 'none', border: '1px solid var(--c300)', color: 'var(--c700)',
          padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        Manage Access
      </button>

      <button
        onClick={() => setShowRemove(true)}
        style={{
          background: 'none', border: 'none', color: 'var(--orange-500)',
          padding: '0.375rem', borderRadius: '0.375rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center'
        }}
        title="Remove Client"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>

      {/* MANAGE ACCESS DIALOG */}
      {showManage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '1rem', textAlign: 'left'
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 'var(--r-lg)',
            width: '100%', maxWidth: '600px', overflow: 'hidden', boxShadow: 'var(--sh-xl)',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--c200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--fh)', fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--c900)' }}>
                  Manage Access: {clientName}
                </h3>
                {isOrphan && <span style={{ color: '#B91C1C', fontSize: '0.75rem', fontWeight: 600 }}>⚠️ Orphaned Portal Access</span>}
              </div>
              <button onClick={() => setShowManage(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c500)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {error && (
                <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '0.75rem 1rem', borderRadius: 'var(--r-md)', marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c900)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Campaigns</h4>
              
              {clientAssignments.length === 0 ? (
                <p style={{ color: 'var(--c500)', fontSize: '0.875rem', marginBottom: '2rem', fontStyle: 'italic' }}>No campaigns currently assigned.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                  {clientAssignments.map(a => (
                    <div key={a.campaign_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--c200)', borderRadius: 'var(--r-md)', background: 'var(--c50)' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--c900)', fontSize: '0.9375rem', marginBottom: '0.25rem' }}>{a.campaigns.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--c500)' }}>Assigned: {new Date(a.created_at).toLocaleDateString()}</div>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(a.campaign_id)}
                        disabled={loadingId === `remove-${a.campaign_id}`}
                        style={{ background: 'none', border: '1px solid #FECACA', color: '#B91C1C', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, cursor: loadingId ? 'not-allowed' : 'pointer' }}
                      >
                        {loadingId === `remove-${a.campaign_id}` ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c900)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assign New Campaign</h4>
              <form onSubmit={handleAssignCampaign} style={{ display: 'flex', gap: '1rem' }}>
                <select 
                  value={selectedCampaign} 
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  style={{ flex: 1, padding: '0.625rem', border: '1px solid var(--c300)', borderRadius: 'var(--r-md)', fontSize: '0.875rem' }}
                >
                  <option value="">-- Select a campaign --</option>
                  {unassignedCampaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                  ))}
                </select>
                <button 
                  type="submit"
                  disabled={!selectedCampaign || loadingId === 'assign-campaign'}
                  style={{ background: 'var(--c900)', color: 'var(--white)', border: 'none', padding: '0.625rem 1rem', borderRadius: 'var(--r-md)', fontSize: '0.875rem', fontWeight: 600, cursor: (!selectedCampaign || loadingId) ? 'not-allowed' : 'pointer' }}
                >
                  {loadingId === 'assign-campaign' ? 'Assigning...' : 'Assign'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* REMOVE CLIENT DIALOG */}
      {showRemove && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '1rem', textAlign: 'left'
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 'var(--r-lg)',
            width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: 'var(--sh-xl)'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--c200)' }}>
              <h3 style={{ fontFamily: 'var(--fh)', fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#B91C1C' }}>
                Remove Client
              </h3>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ color: 'var(--c700)', fontSize: '0.9375rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Are you sure you want to remove <strong>{clientName}</strong>?
              </p>
              <ul style={{ color: 'var(--c600)', fontSize: '0.875rem', marginBottom: '2rem', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                <li>Their portal access will be permanently revoked.</li>
                <li>All active campaign assignments will be removed.</li>
                <li><strong>Campaigns and historical performance data will remain intact.</strong></li>
              </ul>
              
              {error && (
                <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '0.75rem 1rem', borderRadius: 'var(--r-md)', marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  onClick={() => setShowRemove(false)}
                  style={{ background: 'var(--c100)', color: 'var(--c700)', border: 'none', padding: '0.625rem 1rem', borderRadius: 'var(--r-md)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRemoveClient}
                  disabled={loadingId === 'remove-client'}
                  style={{ background: '#DC2626', color: 'var(--white)', border: 'none', padding: '0.625rem 1rem', borderRadius: 'var(--r-md)', fontSize: '0.875rem', fontWeight: 600, cursor: loadingId ? 'not-allowed' : 'pointer' }}
                >
                  {loadingId === 'remove-client' ? 'Removing...' : 'Yes, Remove Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
