'use client';
import './dashboard.css';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Chart from 'chart.js/auto';

import { UserProfile, ClientRecord } from '@/lib/supabase/auth';
import { deriveDeliveryStatus, objectiveLabel, type DeliveryStatus } from '@/lib/meta/results';

/** Greeting by hour: morning 5–11:59, noon 12–13:59, afternoon 14–16:59, evening 17–20:59, night 21–4:59. */
function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 14) return 'Good noon';
  if (hour >= 14 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function dhakaHour(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Dhaka' }).format(date)) % 24;
}

/**
 * Server render uses Asia/Dhaka; after mount it switches to the viewer's own clock and refreshes every minute.
 * The heading carries suppressHydrationWarning for the (expected) server/client text difference.
 */
function useGreeting(): string {
  const [greeting, setGreeting] = useState(() => greetingForHour(dhakaHour(new Date())));
  useEffect(() => {
    const update = () => {
      const local = new Date().getHours();
      setGreeting(greetingForHour(Number.isFinite(local) ? local : dhakaHour(new Date())));
    };
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return greeting;
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`dstatus tone-${status.tone} ${status.isLive ? 'is-live' : ''}`} title={status.description}>
      <span className="dstatus-dot" />{status.label}
    </span>
  );
}

const fmtMoney = (n: number | null | undefined) => (n == null ? 'N/A' : `$${n.toFixed(2)}`);

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const greeting = useGreeting();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'there';
  const delivery = deriveDeliveryStatus(selectedCampaign || {});
  const result = aggregates?.result ?? null;
  const resultLabel: string = result?.spec?.label ?? 'Results';

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

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

    const resultByDate = new Map<string, number>((result?.daily ?? []).map((d: any) => [d.date, d.value]));
    const msgData = insights.map((i: any) => resultByDate.get(i.date) ?? 0);
    const spendData = insights.map((i: any) => Number(i.spend || 0));

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: resultLabel,
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
            title: { display: true, text: resultLabel },
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
  }, [insights, result, resultLabel]);

  return (
    <>
      

  
  <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`} id="sidebar" aria-label="Main sidebar navigation">
    <div className="sidebar-brand">
      <Link href="/dashboard" onClick={() => setSidebarOpen(false)} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <img src="/Official_Logo.jpeg" alt="Marketivity" />
      </Link>
      <button 
        type="button" 
        className="sidebar-close-btn" 
        onClick={() => setSidebarOpen(false)} 
        aria-label="Close navigation sidebar"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div className="sidebar-section-label">Navigation</div>
    <ul className="sidebar-nav">
      <li>
        <Link 
          href="/dashboard" 
          className="active" 
          id="navDashboard"
          onClick={() => setSidebarOpen(false)}
        >
          <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
          Dashboard
        </Link>
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
      <button 
        type="button" 
        onClick={handleSignOut} 
        className="logout-link" 
        id="navLogout"
        aria-label="Sign out of your account"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </button>
    </div>
  </aside>

  <div 
    className={`mobile-overlay ${sidebarOpen ? 'open' : ''}`} 
    id="mobileOverlay" 
    onClick={() => setSidebarOpen(false)}
    aria-hidden={!sidebarOpen}
  ></div>

  <div className="main-area">

    <header className="topbar">
      <div className="topbar-left">
        <button 
          type="button"
          className="hamburger" 
          id="hamburger" 
          aria-label="Toggle navigation menu"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(prev => !prev)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="page-title">Campaign Dashboard</span>
      </div>
      <div className="topbar-right">
        <div className="sync-pill">
          <span className="sync-dot"></span>
          <span className="sync-text-wrap">
            {lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}
          </span>
        </div>
        <div className="topbar-avatar" title={profile?.full_name || 'Client'}>
          {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'CL'}
        </div>
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
          <h1 className="dash-greeting" suppressHydrationWarning>
            {`${greeting}, ${firstName}.`}
          </h1>
          <p className="dash-sub">Here's how your campaign is performing right now.</p>
        </div>
        <div>
          <StatusBadge status={delivery} />
          <div style={{ marginTop: 6, fontSize: '.8125rem', color: 'var(--c500)' }}>{delivery.description}</div>
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
          <div><StatusBadge status={delivery} /></div>
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Objective</div>
          <div className="selector-val">{objectiveLabel(selectedCampaign?.objective)}</div>
        </div>
        <div className="campaign-bar-divider"></div>
        <div className="selector-group">
          <div className="selector-label">Platform</div>
          <div className="platform-icons">
            <span className="platform-chip">Facebook</span>
            <span className="platform-chip">Instagram</span>
          </div>
        </div>
        <div className="date-select" role="group" aria-label="Reporting date range">
          <button type="button" className={`date-btn ${range === 'today' ? 'active' : ''}`} onClick={() => handleRangeChange('today')} aria-pressed={range === 'today'}>Today</button>
          <button type="button" className={`date-btn ${range === '7' ? 'active' : ''}`} onClick={() => handleRangeChange('7')} aria-pressed={range === '7'}>7d</button>
          <button type="button" className={`date-btn ${range === '14' ? 'active' : ''}`} onClick={() => handleRangeChange('14')} aria-pressed={range === '14'}>14d</button>
          <button type="button" className={`date-btn ${range === '30' ? 'active' : ''}`} onClick={() => handleRangeChange('30')} aria-pressed={range === '30'}>30d</button>
          <button type="button" className={`date-btn ${range === 'maximum' ? 'active' : ''}`} onClick={() => handleRangeChange('maximum')} aria-pressed={range === 'maximum'} title="All available data">Max</button>
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
            <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Total Reach
              </span>
              <span style={{ fontSize: '9px', fontWeight: 'bold', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px' }}>LIVE</span>
            </div>
            <div className="kpi-value">
              {aggregates?.reach !== null && aggregates?.reach !== undefined
                ? Math.round(aggregates.reach).toLocaleString()
                : 'N/A'}
            </div>
            <div className="kpi-subtext">Unique accounts (Fetched live from Meta)</div>
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
              Results · {resultLabel}
            </div>
            <div className="kpi-value">{result?.total != null ? Math.round(result.total).toLocaleString() : '—'}</div>
            <div className="kpi-subtext">
              {result?.pendingResync
                ? <span className="kpi-pending">Available after the next full data sync</span>
                : resultLabel}
            </div>
          </div>
          <div className="kpi-card purple">
            <div className="kpi-card-accent"></div>
            <div className="kpi-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6F42C1" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              {result?.spec?.costLabel ?? 'Cost per result'}
            </div>
            <div className="kpi-value">{fmtMoney(result?.costPerResult)}</div>
            <div className="kpi-subtext">{result?.spec?.costPerThousand ? 'Per 1,000' : 'Average'} · selected period</div>
          </div>
        </div>

        <div className="kpi-grid-sec">
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CTR</div>
            <div className="kpi-sm-value">{aggregates?.ctr?.toFixed(2) || '0.00'}%</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CPC</div>
            <div className="kpi-sm-value">{fmtMoney(aggregates?.cpc)}</div>
          </div>
          <div className="kpi-card-sm">
            <div className="kpi-sm-label">CPM</div>
            <div className="kpi-sm-value">${aggregates?.cpm?.toFixed(2) || '0.00'}</div>
          </div>
          {result?.spec?.valueTypes ? (
            <div className="kpi-card-sm">
              <div className="kpi-sm-label">ROAS</div>
              <div className="kpi-sm-value">
                {result.roas != null ? `${result.roas.toFixed(2)}x` : 'N/A'}
                {result.purchaseValue != null && <span style={{ display: 'block', fontSize: '.7rem', fontWeight: 500, color: 'var(--c500)' }}>{fmtMoney(result.purchaseValue)} value</span>}
              </div>
            </div>
          ) : (
            <div className="kpi-card-sm">
              <div className="kpi-sm-label">Frequency</div>
              <div className="kpi-sm-value">
                {aggregates?.reach && aggregates?.impressions ? (aggregates.impressions / aggregates.reach).toFixed(2) : 'N/A'}
              </div>
            </div>
          )}
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
            <button className="chart-tab active" data-chart="results">{resultLabel}</button>
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
            <div style={{ marginBottom: '1.25rem' }}><StatusBadge status={delivery} /></div>
            <p className="status-description">{delivery.description}</p>
            <div className="status-details">
              <div className="detail-row"><span className="detail-key">Campaign Name</span><span className="detail-val">{selectedCampaign?.name || 'No Name'}</span></div>
              <div className="detail-row"><span className="detail-key">Status</span><span className="detail-val">{delivery.label}</span></div>
              <div className="detail-row"><span className="detail-key">Objective</span><span className="detail-val">{objectiveLabel(selectedCampaign?.objective)}</span></div>
              <div className="detail-row"><span className="detail-key">Started</span><span className="detail-val">{selectedCampaign?.start_time ? new Date(selectedCampaign.start_time).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</span></div>
              <div className="detail-row"><span className="detail-key">Result metric</span><span className="detail-val">{resultLabel}</span></div>
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
            <div className="detail-row"><span className="detail-key">Active Campaigns</span><span className="detail-val detail-val-orange">{campaigns.filter((c: any) => deriveDeliveryStatus(c).isLive).length}</span></div>
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

  
    </>
  );
}
