'use client';
import './dashboard.css';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Chart from 'chart.js/auto';

import { UserProfile, ClientRecord } from '@/lib/supabase/auth';

export default function DashboardClient({ profile, client, initialInsights = { spend: 0, impressions: 0, reach: 0, clicks: 0, cpr: 0, ctr: 0 } }: { profile: UserProfile | null, client: ClientRecord | null, initialInsights?: any }) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
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
        <div className="sync-pill">
          <span className="sync-dot"></span>
          Updated recently
        </div>
        <div className="topbar-avatar">{profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'CL'}</div>
      </div>
    </header>

    
    <main className="content">

      
      <div className="demo-notice fade-up">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Data is synced from the Meta Marketing API via a secure backend cron job.</span>
      </div>

      
      <div className="dash-header fade-up">
        <div>
          <h1 className="dash-greeting">Good evening, {profile?.full_name?.split(' ')[0] || 'Client'}.</h1>
          <p className="dash-sub">Here's how your campaign is performing right now.</p>
        </div>
        <div >
          <div className="status-live">
            <span className="live-dot"></span>LIVE
          </div>
          <div >Campaign is currently active</div>
        </div>
      </div>

      
      <div className="campaign-bar fade-up">
        <div className="selector-group">
          <div className="selector-label">Campaign</div>
          <div className="selector-val">{client?.name || 'Marketivity Client'} — Messages</div>
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Status</div>
          <div >
            <span ></span> Active
          </div>
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Objective</div>
          <div className="selector-val">Messaging Conversations</div>
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
          <button className="date-btn" data-range="7">7d</button>
          <button className="date-btn active" data-range="14">14d</button>
          <button className="date-btn" data-range="30">30d</button>
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
            <div className="kpi-value">${initialInsights.spend.toFixed(2)}</div>
            <div className="kpi-subtext">Lifetime tracked spend</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Reach
            </div>
            <div className="kpi-value">{initialInsights.reach.toLocaleString()}</div>
            <div className="kpi-subtext">Unique accounts reached</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Impressions
            </div>
            <div className="kpi-value">{initialInsights.impressions.toLocaleString()}</div>
            <div className="kpi-subtext">Total ad views served</div>
          </div>
          <div className="kpi-card green">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Results (Clicks)
            </div>
            <div className="kpi-value">{initialInsights.clicks.toLocaleString()}</div>
            <div className="kpi-subtext">Total link clicks</div>
          </div>
          <div className="kpi-card purple">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6F42C1" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Cost per Click
            </div>
            <div className="kpi-value">${initialInsights.cpr.toFixed(2)}</div>
            <div className="kpi-subtext">Average cost per click</div>
          </div>
        </div>

        
        <div className="kpi-grid-sec" >
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CTR</div>
            <div className="kpi-sm-value">{initialInsights.ctr.toFixed(2)}%</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CPC</div>
            <div className="kpi-sm-value">${initialInsights.cpr.toFixed(2)}</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CPM</div>
            <div className="kpi-sm-value">${initialInsights.impressions > 0 ? ((initialInsights.spend / initialInsights.impressions) * 1000).toFixed(2) : '0.00'}</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">Frequency</div>
            <div className="kpi-sm-value">{initialInsights.reach > 0 ? (initialInsights.impressions / initialInsights.reach).toFixed(2) : '0.00'}</div>
          </div>
        </div>
      </div>

      
      <div className="chart-card fade-up">
        <div className="chart-header">
          <div>
            <div className="chart-title">Performance Overview</div>
            <div className="chart-sub">Campaign trend — last 14 days</div>
          </div>
          <div className="chart-tabs">
            <button className="chart-tab active" data-chart="results">Results</button>
            <button className="chart-tab" data-chart="spend">Spend</button>
            <button className="chart-tab" data-chart="cpr">Cost / Result</button>
          </div>
        </div>
        <div className="chart-wrapper">
          <canvas id="perfChart"></canvas>
        </div>
        <div className="chart-notice">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" ><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Chart shows <span>illustrative development data</span>. Production data will connect to the Meta Marketing API.
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
            <div className="status-indicator si-live">
              <span className="si-dot"></span> LIVE — Campaign Active
            </div>
            <p className="status-description">Your campaign is currently active and delivering to your target audience on Facebook and Instagram.</p>
            <div className="status-details">
              <div className="detail-row"><span className="detail-key">Campaign Name</span><span className="detail-val">{client?.name || 'Marketivity Client'} — Messages</span></div>
              <div className="detail-row"><span className="detail-key">Objective</span><span className="detail-val">Messaging Conversations</span></div>
              <div className="detail-row"><span className="detail-key">Started</span><span className="detail-val">Sep 1, 2025</span></div>
              <div className="detail-row"><span className="detail-key">Daily Budget</span><span className="detail-val detail-val-orange">$5.00 / day</span></div>
              <div className="detail-row"><span className="detail-key">Amount Spent</span><span className="detail-val">$4.00 (demo)</span></div>
            </div>
          </div>

          
          <div className="details-card fade-up">
            <button className="details-toggle" id="detailsToggle">
              <span>Campaign Details</span>
              <span className="toggle-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </button>
            <div className="details-body" id="detailsBody">
              <div className="details-grid">
                <div className="detail-field"><div className="df-label">Platform</div><div className="df-value">Facebook &amp; Instagram</div></div>
                <div className="detail-field"><div className="df-label">Ad Placements</div><div className="df-value">Automatic</div></div>
                <div className="detail-field"><div className="df-label">Audience</div><div className="df-value">Custom — defined</div></div>
                <div className="detail-field"><div className="df-label">Location</div><div className="df-value">Rajshahi, BD</div></div>
                <div className="detail-field"><div className="df-label">Age Range</div><div className="df-value">18–55</div></div>
                <div className="detail-field"><div className="df-label">Gender</div><div className="df-value">All</div></div>
                <div className="detail-field"><div className="df-label">End Date</div><div className="df-value df-value-muted">Ongoing</div></div>
                <div className="detail-field"><div className="df-label">Billing Event</div><div className="df-value df-value-muted">Impressions</div></div>
              </div>
            </div>
          </div>

        </div>

        
        <div className="col-right">

          
          <div className="update-card fade-up">
            <div className="update-inner">
              <div className="update-type update-type-perf">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                Performance Update
              </div>
              <div className="update-title">Campaign is delivering consistently.</div>
              <div className="update-body">
                Your campaign is currently generating messaging conversations at a competitive cost. We are actively monitoring audience response and creative performance. Optimization decisions will be made once we have sufficient data from the first phase of delivery.
              </div>
              <div className="update-meta">
                <div className="update-meta-from">
                  <div className="team-avatar">M</div>
                  <span>Marketivity Team</span>
                </div>
                <span>Sep 12, 2025</span>
              </div>
            </div>
          </div>

          
          <div className="rec-card fade-up">
            <div className="card-title" >
              <span>Marketivity Recommendations</span>
              <div className="card-title-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c600)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
            </div>
            <div className="rec-list">
              <div className="rec-item">
                <div className="rec-icon-box rib-orange">💡</div>
                <div className="rec-content">
                  <div className="rec-type">Creative Recommendation</div>
                  <div className="rec-text">Consider preparing an additional creative variation. Testing multiple creatives helps identify which message resonates most with your audience.</div>
                </div>
              </div>
              <div className="rec-item">
                <div className="rec-icon-box rib-purple">🎯</div>
                <div className="rec-content">
                  <div className="rec-type rec-type-pur">Audience Observation</div>
                  <div className="rec-text">We are monitoring the quality of incoming conversations before recommending any audience expansion. Patience here protects your budget.</div>
                </div>
              </div>
              <div className="rec-item">
                <div className="rec-icon-box rib-green">📊</div>
                <div className="rec-content">
                  <div className="rec-type rec-type-grn">Budget Note</div>
                  <div className="rec-text">Current performance is being evaluated at the existing budget level before any increase is recommended. We will advise when the data supports scaling.</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      
      <div className="bottom-row">

        
        <div className="activity-card fade-up">
          <div className="card-title" >
            <span>Recent Activity</span>
            <div className="card-title-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c600)" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
          </div>
          <div className="activity-list">
            <div className="activity-date-group">
              <div className="activity-date-label">Today — Sep 12</div>
              <div className="activity-item act-primary">
                <div className="act-content">
                  <div className="act-title">Campaign optimization reviewed</div>
                  <div className="act-sub">Audience delivery and creative performance assessed. No changes required at this stage.</div>
                </div>
              </div>
              <div className="activity-item act-purple">
                <div className="act-content">
                  <div className="act-title">Performance update published</div>
                  <div className="act-sub">Marketivity team posted a campaign status update to your portal.</div>
                </div>
              </div>
            </div>
            <div className="activity-date-group">
              <div className="activity-date-label">Yesterday — Sep 11</div>
              <div className="activity-item">
                <div className="act-content">
                  <div className="act-title">Creative performance monitored</div>
                  <div className="act-sub">Ad creative delivery assessed across placements. Performing within expected range.</div>
                </div>
              </div>
            </div>
            <div className="activity-date-group">
              <div className="activity-date-label">Sep 10</div>
              <div className="activity-item act-green">
                <div className="act-content">
                  <div className="act-title">Messaging conversations growing</div>
                  <div className="act-sub">Campaign passed the learning phase. Delivery becoming more stable.</div>
                </div>
              </div>
            </div>
            <div className="activity-date-group">
              <div className="activity-date-label">Sep 1</div>
              <div className="activity-item act-primary">
                <div className="act-content">
                  <div className="act-title">Campaign launched</div>
                  <div className="act-sub">{client?.name || 'Marketivity Client'} — Messages campaign went live on Facebook &amp; Instagram.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        
        <div className="col-right">
          <div className="update-card fade-up" >
            <div className="update-inner">
              <div className="update-type" >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Optimization Update
              </div>
              <div className="update-title" >Campaign is in the learning phase.</div>
              <div className="update-body" >
                All new campaigns go through Meta's learning phase — a period where the system finds the best audience for your objective. We expect delivery to stabilise over the coming days. No action is needed from your side.
              </div>
              <div className="update-meta" >
                <div className="update-meta-from">
                  <div className="team-avatar">M</div>
                  <span>Marketivity Team</span>
                </div>
                <span>Sep 3, 2025</span>
              </div>
            </div>
          </div>

          <div className="activity-card fade-up" >
            <div className="card-title" >
              <span>Your Account</span>
            </div>
            <div className="detail-row"><span className="detail-key">Client</span><span className="detail-val">{client?.name || 'Marketivity Client'}</span></div>
            <div className="detail-row"><span className="detail-key">Account Manager</span><span className="detail-val">Marketivity Team</span></div>
            <div className="detail-row"><span className="detail-key">Active Campaigns</span><span className="detail-val detail-val-orange">1</span></div>
            <div className="detail-row"><span className="detail-key">Portal Access</span><span className="detail-val" >Active</span></div>
            <div className="detail-row" >
              <a href="mailto:hello@marketivity.com" >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Contact your account team
              </a>
            </div>
          </div>
        </div>

      </div>

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
