"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./login.css";

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="lg-topbar">
      <div className="lg-logo-tile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Official_Logo.jpeg" alt="" />
      </div>
      <div className="lg-wordmark" style={dark ? { color: "#fff" } : undefined}>
        Marketivity
        <small>Client Portal</small>
      </div>
    </div>
  );
}

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
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Incorrect email or password. Please try again.");
      setLoading(false);
    } else {
      router.push("/auth/redirect");
      router.refresh(); // Refresh to apply middleware state
    }
  };

  return (
    <div className="lg">
      {/* ── Brand panel: desktop (≥1024px) only ───────────── */}
      <aside className="lg-brand" aria-hidden="true">
        <Logo dark />
        <div>
          <div className="lg-eyebrow">Client Portal</div>
          <h1 className="lg-hero">
            Your campaigns,<br />
            <em>clearly presented.</em>
          </h1>
          <p className="lg-lead">
            A secure space to review your advertising performance, read our latest campaign updates,
            and track the results that matter to your business.
          </p>
          <div className="lg-feats">
            <div className="lg-feat">
              <div className="lg-feat-ic">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F7931E" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <div><b>Live campaign metrics</b><small>Results synced from Meta every 30 minutes</small></div>
            </div>
            <div className="lg-feat">
              <div className="lg-feat-ic">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F7931E" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <div><b>Marketivity updates</b><small>Insights and recommendations from your account team</small></div>
            </div>
            <div className="lg-feat">
              <div className="lg-feat-ic">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F7931E" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <div><b>Private &amp; secure</b><small>Your data is only visible to your account</small></div>
            </div>
          </div>
        </div>
        <p className="lg-brand-foot">&copy; {new Date().getFullYear()} Marketivity · Digital Growth Partners · Rajshahi, Bangladesh</p>
      </aside>

      {/* ── Form panel ────────────────────────────────────── */}
      <main className="lg-main">
        <Logo />
        <div className="lg-center">
          <div className="lg-card">
            <div className="lg-pill"><i />Secure client portal</div>
            <h2 className="lg-title">Welcome back</h2>
            <p className="lg-sub">Sign in to see your campaign performance and the latest updates from your Marketivity team.</p>

            {error && (
              <div className="lg-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} noValidate>
              <div className="lg-field">
                <label htmlFor="email" className="lg-label">Email address</label>
                <div className="lg-input-wrap">
                  <span className="lg-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                  </span>
                  <input
                    className="lg-input" type="email" id="email" name="email" placeholder="you@company.com" required
                    autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="lg-field">
                <label htmlFor="password" className="lg-label">Password</label>
                <div className="lg-input-wrap">
                  <span className="lg-input-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </span>
                  <input
                    className="lg-input has-toggle" type={showPassword ? "text" : "password"} id="password" name="password"
                    placeholder="••••••••" required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="lg-toggle" onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      {showPassword ? (
                        <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                      ) : (
                        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div className="lg-row">
                <a className="lg-link" href="mailto:hello@marketivity.com?subject=Password%20Reset%20Request">Forgot password?</a>
              </div>

              <button type="submit" className="lg-btn" disabled={loading}>
                {loading ? <span className="lg-spinner" aria-label="Signing in" /> : (
                  <>
                    Sign in
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                  </>
                )}
              </button>
            </form>

            <div className="lg-help">
              Need access? <a className="lg-link" style={{ minHeight: 0 }} href="mailto:hello@marketivity.com">Contact Marketivity</a>
            </div>
          </div>
        </div>
        <p className="lg-foot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ verticalAlign: "-1px", marginRight: 6 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          Encrypted connection · &copy; {new Date().getFullYear()} Marketivity
        </p>
      </main>
    </div>
  );
}
