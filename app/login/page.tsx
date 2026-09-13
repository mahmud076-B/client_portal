"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Incorrect email or password. Please try again.");
      setLoading(false);
    } else {
      router.push("/auth/redirect");
      router.refresh(); // Refresh to apply middleware state
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      minHeight: '100vh',
      background: 'var(--c900)'
    }}>
      {/* ── LEFT BRAND PANEL ─────────────────────────────── */}
      <div className="left-panel" style={{
        background: 'var(--c900)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '3rem',
        overflow: 'hidden'
      }}>
        {/* Geometric accents */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '280px', height: '280px',
          border: '1px solid rgba(255,255,255,.04)',
          borderRadius: 'var(--r-xl)',
          transform: 'rotate(20deg)'
        }} />
        <div style={{
          position: 'absolute', bottom: '80px', left: '-40px',
          width: '160px', height: '160px',
          border: '1px solid rgba(247,147,30,.08)',
          borderRadius: 'var(--r-xl)',
          transform: 'rotate(-15deg)'
        }} />
        <div style={{
          position: 'absolute', bottom: '-30px', right: '60px',
          width: '0', height: '0',
          borderLeft: '40px solid transparent',
          borderRight: '40px solid transparent',
          borderBottom: '68px solid rgba(247,147,30,.06)'
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Official_Logo.jpeg" alt="Marketivity" style={{ height: '44px', objectFit: 'contain', filter: 'brightness(1.05)' }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3rem 0' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            fontFamily: 'var(--fh)', fontSize: '.7rem', fontWeight: 700,
            letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--orange-500)', marginBottom: '1.25rem'
          }}>
            <span style={{ width: '20px', height: '2px', background: 'var(--orange-500)' }} />Client Portal
          </div>
          <h1 style={{
            fontFamily: 'var(--fh)', fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
            fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15,
            color: 'var(--white)', marginBottom: '1.25rem'
          }}>
            Your campaigns,<br/>
            <span style={{ color: 'var(--orange-500)' }}>clearly presented.</span>
          </h1>
          <p style={{
            fontSize: '1rem', color: 'var(--c400)', lineHeight: 1.75,
            maxWidth: '38ch', marginBottom: '3rem'
          }}>
            A secure space where you can review your advertising performance,
            read our latest campaign updates, and track the results that matter to your business.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.875rem' }}>
            {/* Trust Indicator 1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.875rem' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: 'var(--r-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, background: 'rgba(247,147,30,.12)'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F7931E" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div style={{ fontFamily: 'var(--fh)', fontSize: '.875rem', fontWeight: 600, color: 'var(--c300)' }}>
                Live Campaign Metrics<small style={{ display: 'block', fontSize: '.75rem', fontWeight: 400, color: 'var(--c500)', marginTop: '1px' }}>Performance data synced regularly from your active campaigns</small>
              </div>
            </div>
            {/* Trust Indicator 2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.875rem' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: 'var(--r-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, background: 'rgba(111,66,193,.12)'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F42C1" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div style={{ fontFamily: 'var(--fh)', fontSize: '.875rem', fontWeight: 600, color: 'var(--c300)' }}>
                Marketivity Updates<small style={{ display: 'block', fontSize: '.75rem', fontWeight: 400, color: 'var(--c500)', marginTop: '1px' }}>Direct insights and recommendations from your account team</small>
              </div>
            </div>
            {/* Trust Indicator 3 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.875rem' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: 'var(--r-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, background: 'rgba(247,147,30,.12)'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F7931E" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div style={{ fontFamily: 'var(--fh)', fontSize: '.875rem', fontWeight: 600, color: 'var(--c300)' }}>
                Private & Secure<small style={{ display: 'block', fontSize: '.75rem', fontWeight: 400, color: 'var(--c500)', marginTop: '1px' }}>Your campaign data is only accessible to your account</small>
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: '.75rem', color: 'var(--c600)' }}>&copy; 2025 Marketivity &mdash; Digital Growth Partners &middot; Rajshahi, Bangladesh</p>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ──────────────────────────────── */}
      <div className="right-panel" style={{
        background: 'var(--white)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem clamp(2rem, 6vw, 5rem)'
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          
          <div className="login-logo-mobile" style={{ display: 'none', marginBottom: '2rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Official_Logo.jpeg" alt="Marketivity" style={{ height: '36px', objectFit: 'contain' }} />
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            fontFamily: 'var(--fh)', fontSize: '.7rem', fontWeight: 700,
            letterSpacing: '.06em', textTransform: 'uppercase',
            background: 'var(--c100)', color: 'var(--c600)',
            padding: '.25rem .75rem', borderRadius: 'var(--r-pill)',
            marginBottom: '1.5rem'
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'var(--orange-500)',
              animation: 'pulse-dot 2s ease-in-out infinite'
            }} />
            Secure Client Portal
          </div>

          <h2 style={{
            fontFamily: 'var(--fh)', fontSize: 'clamp(1.375rem, 2.5vw, 1.75rem)',
            fontWeight: 800, letterSpacing: '-.025em', color: 'var(--c900)',
            marginBottom: '.625rem'
          }}>Welcome back.</h2>
          <p style={{
            fontSize: '.9375rem', color: 'var(--c500)', lineHeight: 1.65,
            marginBottom: '2.5rem'
          }}>Sign in to view your campaign performance and the latest updates from your Marketivity team.</p>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '.625rem',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 'var(--r-md)', padding: '.875rem 1rem',
              marginBottom: '1.25rem', fontSize: '.875rem', color: '#B91C1C',
              fontFamily: 'var(--fh)', fontWeight: 500
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} noValidate>
            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="email" style={{
                display: 'block', fontFamily: 'var(--fh)', fontSize: '.8125rem',
                fontWeight: 600, color: 'var(--c700)', marginBottom: '.5rem'
              }}>Email address</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--c400)', pointerEvents: 'none', display: 'flex', alignItems: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input 
                  type="email" id="email" name="email" placeholder="your@email.com" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%', padding: '13px 16px 13px 42px',
                    fontFamily: 'var(--fb)', fontSize: '.9375rem', color: 'var(--c900)',
                    background: 'var(--white)', border: '1.5px solid var(--c200)',
                    borderRadius: 'var(--r-md)', outline: 'none'
                  }} 
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="password" style={{
                display: 'block', fontFamily: 'var(--fh)', fontSize: '.8125rem',
                fontWeight: 600, color: 'var(--c700)', marginBottom: '.5rem'
              }}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--c400)', pointerEvents: 'none', display: 'flex', alignItems: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input 
                  type={showPassword ? "text" : "password"} id="password" name="password" placeholder="••••••••" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '13px 16px 13px 42px',
                    fontFamily: 'var(--fb)', fontSize: '.9375rem', color: 'var(--c900)',
                    background: 'var(--white)', border: '1.5px solid var(--c200)',
                    borderRadius: 'var(--r-md)', outline: 'none'
                  }} 
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{
                  position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c400)',
                  display: 'flex', alignItems: 'center'
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {showPassword ? (
                      <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    ) : (
                      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '1.75rem' }}>
              <a href="#" style={{
                fontFamily: 'var(--fh)', fontSize: '.8125rem', fontWeight: 600,
                color: 'var(--orange-600)', textDecoration: 'none'
              }}>Forgot password?</a>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
              fontFamily: 'var(--fh)', fontSize: '.9375rem', fontWeight: 700,
              background: 'var(--c900)', color: 'var(--white)', border: 'none', borderRadius: 'var(--r-md)',
              padding: '14px 28px', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '.01em',
              boxShadow: 'var(--sh-lg)', position: 'relative', overflow: 'hidden'
            }}>
              {loading ? (
                <div style={{
                  width: '20px', height: '20px', border: '2px solid rgba(255,255,255,.3)',
                  borderTopColor: 'var(--white)', borderRadius: '50%', animation: 'spin .7s linear infinite'
                }} />
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Sign In
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </span>
              )}
            </button>
          </form>

          <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '.8125rem', color: 'var(--c500)' }}>
            Need access? <a href="mailto:hello@marketivity.com" style={{ color: 'var(--orange-600)', textDecoration: 'none', fontWeight: 600 }}>Contact Marketivity</a>
          </div>

        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          .left-panel { display: none !important; }
          .right-panel { min-height: 100vh !important; padding: 2.5rem 1.5rem !important; }
          .login-logo-mobile { display: block !important; }
        }
      `}} />
    </div>
  );
}
