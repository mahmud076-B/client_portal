'use client';
import './dashboard.css';
import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Chart from 'chart.js/auto';

import { UserProfile, ClientRecord } from '@/lib/supabase/auth';

export default function DashboardClient({
  profile,
  client,
  campaigns,
  selectedCampaign,
  insights,
  aggregates,
  range,
  lastSyncedAt
}: {
  profile: UserProfile | null;
  client: ClientRecord | null;
  campaigns: any[];
  selectedCampaign: any;
  insights: any[];
  aggregates: any;
  range: string;
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  const handleCampaignChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('campaignId', e.target.value);
    router.push(`${pathname}?${newParams.toString()}`);
  };

  const handleRangeChange = (newRange: string) => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('range', newRange);
    newParams.delete('days'); // clear legacy param
    router.push(`${pathname}?${newParams.toString()}`);
  };

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    // Intersection Observer for fade-up animations
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-up').forEach((el, i) => {
      if (el instanceof HTMLElement) {
        el.style.transitionDelay = (i * 60) + 'ms';
      }
      io.observe(el);
    });

    return () => {
      io.disconnect();
    };
  }, []);

  // Chart Rendering
  useEffect(() => {
    if (!chartRef.current || !insights || insights.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const labels = insights.map((i: any) => {
      const d = new Date(i.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    const msgData = insights.map((i: any) => i.messaging_conversations_started || 0);
    const spendData = insights.map((i: any) => Number(i.spend || 0));

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Conversations',
            data: msgData,
            borderColor: '#22C55E',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Spend ($)',
            data: spendData,
            borderColor: '#F7931E',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            tension: 0.4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Conversations' },
            min: 0,
            ticks: { precision: 0 }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Spend ($)' },
            grid: { drawOnChartArea: false },
            min: 0
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [insights]);

  return (
    <>
      

  
  <aside className="sidebar" id="sidebar">
    <div className="sidebar-brand">
      <img src="../Official_Logo.jpeg" alt="Marketivity" />
    </div>

    <div className="sidebar-section-label">Navigation</div>
    <ul className="sidebar-nav">
      <li>
        <a href="#" className="active" id="navDashboard">
          <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
          Dashboard
        </a>
      </li>
      <li>
        <a href="#" id="navCampaigns">
          <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>
          Campaigns
          <span className="nav-badge">1</span>
        </a>
      </li>
      <li>
        <a href="#" id="navUpdates">
          <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
          Updates
          <span className="nav-badge">2</span>
        </a>
      </li>

    </ul>

    <div className="sidebar-bottom">
      <div className="client-identity">
        <div className="client-avatar">{profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'CL'}</div>
        <div>
          <div className="client-name">{profile?.full_name || 'Client'}</div>
          <div className="client-company">{client?.name || 'Marketivity Client'}</div>
        </div>
      </div>
      <a href="#" onClick={handleSignOut} className="logout-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </a>
    </div>
  </aside>

  
  <div className="mobile-overlay" id="mobileOverlay"></div>

  
  <div className="main-area">

    
    <header className="topbar">
      <div className="topbar-left">
        <button className="hamburger" id="hamburger" aria-label="Toggle navigation">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="page-title">Campaign Dashboard</span>
      </div>
      <div className="topbar-right">
        <div className="sync-pill" style={{ whiteSpace: 'nowrap' }}>
          <span className="sync-dot"></span>
          {lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}
        </div>
        <div className="topbar-avatar">{profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'CL'}</div>
      </div>
    </header>

    
        <main className="content">
      {(!campaigns || campaigns.length === 0) ? (
        <div className="demo-notice fade-up" style={{ textAlign: 'center', padding: '40px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ margin: '0 auto 10px', display: 'block' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <h2 style={{ marginBottom: '10px' }}>No Campaigns Assigned</h2>
          <span>Your campaigns will appear here once they are assigned.</span>
        </div>
      ) : (<>

      {/* Top Bar - Campaign Selector & Sync Status */}
      <div className="demo-notice fade-up">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Data is synced from the Meta Marketing API via a secure backend cron job.</span>
      </div>

      <div className="dash-header fade-up">
        <div>
          <h1 className="dash-greeting">Good evening, {profile?.full_name?.split(' ')[0] || 'Client'}.</h1>
          <p className="dash-sub">Here's how your campaign is performing right now.</p>
        </div>
        <div>
          <div className={`status-live ${selectedCampaign?.status === 'ACTIVE' ? '' : 'paused'}`}>
            <span className="live-dot"></span>{selectedCampaign?.status || 'UNKNOWN'}
          </div>
          <div>Campaign is currently {selectedCampaign?.status?.toLowerCase() || 'unknown'}</div>
        </div>
      </div>

      <div className="campaign-bar fade-up">
        <div className="selector-group">
          <div className="selector-label">Campaign</div>
          {campaigns && campaigns.length > 1 ? (
            <select className="selector-val" style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 'bold', outline: 'none', cursor: 'pointer', paddingRight: '10px' }} value={selectedCampaign?.id || ''} onChange={handleCampaignChange}>
              {campaigns.map((c: any) => (
                <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.name}</option>
              ))}
            </select>
          ) : (
            <div className="selector-val">{selectedCampaign?.name || 'No Campaign'}</div>
          )}
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Status</div>
          <div>
            {selectedCampaign?.status || 'Unknown'}
          </div>
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Objective</div>
          <div className="selector-val">{selectedCampaign?.objective || 'Not Set'}</div>
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Platform</div>
          <div className="platform-icons">
            <span className="platform-chip">Facebook</span>
            <span className="platform-chip">Instagram</span>
          </div>
        </div>
        <div className="date-select">
          <button className={`date-btn ${range === 'today' ? 'active' : ''}`} onClick={() => handleRangeChange('today')}>Today</button>
          <button className={`date-btn ${range === '7' ? 'active' : ''}`} onClick={() => handleRangeChange('7')}>7d</button>
          <button className={`date-btn ${range === '14' ? 'active' : ''}`} onClick={() => handleRangeChange('14')}>14d</button>
          <button className={`date-btn ${range === '30' ? 'active' : ''}`} onClick={() => handleRangeChange('30')}>30d</button>
          <button className={`date-btn ${range === 'maximum' ? 'active' : ''}`} onClick={() => handleRangeChange('maximum')} title="All available data">Max</button>
        </div>
      </div>

      <div className="kpi-section fade-up">
        <div className="section-eyebrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Key Performance Metrics
        </div>
        <div className="kpi-grid">
          <div className="kpi-card primary">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F7931E" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Total Spend
            </div>
            <div className="kpi-value">${aggregates?.spend?.toFixed(2) || '0.00'}</div>
            <div className="kpi-subtext">Lifetime tracked spend</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-accent"></div>
              <div className="kpi-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Avg Daily Reach
              </div>
            <div className="kpi-value">{aggregates?.reach ? Math.round(aggregates.reach).toLocaleString() : '0'}</div>
            <div className="kpi-subtext">Avg accounts reached per day</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Impressions
            </div>
            <div className="kpi-value">{aggregates?.impressions?.toLocaleString() || '0'}</div>
            <div className="kpi-subtext">Total ad views served</div>
          </div>
          <div className="kpi-card green">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Results (Conversations)
            </div>
            <div className="kpi-value">{aggregates?.messaging_conversations?.toLocaleString() || '0'}</div>
            <div className="kpi-subtext">Messaging conversations started</div>
          </div>
          <div className="kpi-card purple">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6F42C1" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Cost per Conv.
            </div>
            <div className="kpi-value">{aggregates?.cost_per_messaging_conversation != null ? `$${aggregates.cost_per_messaging_conversation.toFixed(2)}` : 'N/A'}</div>
            <div className="kpi-subtext">Avg cost per conversation</div>
          </div>
        </div>

        <div className="kpi-grid-sec">
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CTR</div>
            <div className="kpi-sm-value">{aggregates?.ctr?.toFixed(2) || '0.00'}%</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CPA (Msg)</div>
            <div className="kpi-sm-value">{aggregates?.cost_per_messaging_conversation != null ? `$${aggregates.cost_per_messaging_conversation.toFixed(2)}` : 'N/A'}</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CPM</div>
            <div className="kpi-sm-value">${aggregates?.cpm?.toFixed(2) || '0.00'}</div>
          </div>
          <div className="kpi-card-sm" style={{ visibility: 'hidden' }}>
            <div className="kpi-sm-label">Frequency</div>
            <div className="kpi-sm-value">0.00</div>
          </div>
        </div>
      </div>

      <div className="chart-card fade-up">
        <div className="chart-header">
          <div>
            <div className="chart-title">Performance Overview</div>
            <div className="chart-sub">
              {range === 'maximum' ? 'All available data' : range === 'today' ? 'Today' : `Last ${range} days`}
            </div>
          </div>
          <div className="chart-tabs">
            <button className="chart-tab active" data-chart="results">Results</button>
          </div>
        </div>
        <div className="chart-wrapper">
          {(!insights || insights.length === 0) ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              No performance data available for this period.
            </div>
          ) : (
            <canvas id="perfChart" ref={chartRef}></canvas>
          )}
        </div>
        <div className="chart-notice">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Chart shows real live data securely synced from the Meta Marketing API.
        </div>
      </div>

      <div className="two-col">
        <div className="col-left">

          <div className="status-card fade-up">
            <div className="card-title">
              <span>Campaign Status</span>
              <div className="card-title-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c600)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            </div>
            <div className={`status-indicator ${selectedCampaign?.status === 'ACTIVE' ? 'si-live' : ''}`}>
              {selectedCampaign?.status === 'ACTIVE' ? <span className="si-dot"></span> : null} {selectedCampaign?.status || 'UNKNOWN'}
            </div>
            <p className="status-description">Live campaign details synced directly from Meta.</p>
            <div className="status-details">
              <div className="detail-row"><span className="detail-key">Campaign Name</span><span className="detail-val">{selectedCampaign?.name || 'No Name'}</span></div>
              <div className="detail-row"><span className="detail-key">Status</span><span className="detail-val">{selectedCampaign?.effective_status || selectedCampaign?.status || 'Unknown'}</span></div>
              <div className="detail-row"><span className="detail-key">Objective</span><span className="detail-val">{selectedCampaign?.objective || 'Not Set'}</span></div>
              <div className="detail-row"><span className="detail-key">Started</span><span className="detail-val">{selectedCampaign?.start_time ? new Date(selectedCampaign.start_time).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</span></div>
              <div className="detail-row"><span className="detail-key">End Date</span><span className="detail-val">{selectedCampaign?.end_time ? new Date(selectedCampaign.end_time).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Ongoing'}</span></div>
              {selectedCampaign?.daily_budget != null && (
                <div className="detail-row">
                  <span className="detail-key">
                    {selectedCampaign.budget_source === 'adset_aggregated' ? 'Ad Set Budget' : 'Daily Budget'}
                  </span>
                  <span className="detail-val detail-val-orange">
                    ${Number(selectedCampaign.daily_budget).toFixed(2)} / day
                  </span>
                </div>
              )}
              {selectedCampaign?.lifetime_budget != null && (
                <div className="detail-row">
                  <span className="detail-key">
                    {selectedCampaign.budget_source === 'adset_aggregated' ? 'Ad Set Budget (Lifetime)' : 'Lifetime Budget'}
                  </span>
                  <span className="detail-val detail-val-orange">
                    ${Number(selectedCampaign.lifetime_budget).toFixed(2)} total
                  </span>
                </div>
              )}
              {selectedCampaign?.daily_budget == null && selectedCampaign?.lifetime_budget == null && (
                <div className="detail-row"><span className="detail-key">Budget</span><span className="detail-val">Not set</span></div>
              )}
            </div>
          </div>

          {/* Future slot: Dynamic Campaign Details could go here */}

        </div>

        <div className="col-right">
          
          {/* Future slot: Updates and Recommendations */}

          <div className="activity-card fade-up">
            <div className="card-title">
              <span>Your Account</span>
            </div>
            <div className="detail-row"><span className="detail-key">Client</span><span className="detail-val">{client?.name || 'Marketivity Client'}</span></div>
            <div className="detail-row"><span className="detail-key">Account Manager</span><span className="detail-val">Marketivity Team</span></div>
            <div className="detail-row"><span className="detail-key">Active Campaigns</span><span className="detail-val detail-val-orange">{campaigns.filter((c: any) => c.status === 'ACTIVE' || c.effective_status === 'ACTIVE').length}</span></div>
            <div className="detail-row"><span className="detail-key">Portal Access</span><span className="detail-val">Active</span></div>
            <div className="detail-row">
              <a href="mailto:hello@marketivity.com">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Contact your account team
              </a>
            </div>
          </div>

        </div>
      </div>
      </>)}
    </main>
  </div>

  
  <nav className="mobile-nav">
    <a href="#" className="mob-nav-item active">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      Dashboard
    </a>
    <a href="#" className="mob-nav-item">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Campaigns
    </a>
    <a href="#" className="mob-nav-item">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      Updates
    </a>

    <a href="#" onClick={handleSignOut} className="mob-nav-item">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Sign Out
    </a>
  </nav>

  

    </>
  );
}
