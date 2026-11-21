"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, BrandMark, Button, Field, Input } from "@/components/ui";
import "./login-glass.css";

const FEATURES = [
  {
    title: "Live campaign metrics",
    body: "Performance synced regularly from your active Meta campaigns.",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  },
  {
    title: "Insights from your team",
    body: "Updates and recommendations straight from your account managers.",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  },
  {
    title: "Private & secure",
    body: "Your data is visible only to your organization.",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  },
];

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
    <div className="lgx">
      {/* ── Brand story (desktop/tablet only) ───────────────────────── */}
      <section className="lgx-story">
        <BrandMark tagline="Digital Growth Partners" />
        <div className="lgx-story__body">
          <span className="gx-eyebrow">Client Portal</span>
          <h1 className="lgx-title">
            Your campaigns,<br />
            <span className="gx-accent">clearly presented.</span>
          </h1>
          <p className="gx-lead">
            A secure space to review advertising performance, read campaign updates and track the results that matter to your business.
          </p>
          <ul className="lgx-features">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="lgx-feature gx-glass" data-reveal="" style={{ ["--rv-delay" as string]: `${120 + i * 90}ms` }}>
                <span className="lgx-feature__icon" aria-hidden>{f.icon}</span>
                <span>
                  <strong>{f.title}</strong>
                  <small>{f.body}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="lgx-foot">&copy; {new Date().getFullYear()} Marketivity · Rajshahi, Bangladesh</p>
      </section>

      {/* ── Sign-in ─────────────────────────────────────────────────── */}
      <main className="lgx-main">
        <div className="lgx-mobile-brand"><BrandMark /></div>

        <div className="gx-card lgx-card" data-reveal="">
          <div className="lgx-card__head">
            <h2>Welcome back</h2>
            <p>Sign in to see how your campaigns are performing.</p>
          </div>

          {error && <Alert>{error}</Alert>}

          <form onSubmit={handleLogin} noValidate className="lgx-form">
            <Field label="Email address" htmlFor="email">
              <Input
                type="email" id="email" name="email" placeholder="your@email.com" required
                autoComplete="email" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                type={showPassword ? "text" : "password"} id="password" name="password" placeholder="••••••••" required
                autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                trailing={
                  <button type="button" className="lgx-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      {showPassword ? (
                        <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                      ) : (
                        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                      )}
                    </svg>
                  </button>
                }
              />
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={loading}>
              {loading ? "Signing in…" : (
                <>
                  Sign in
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </>
              )}
            </Button>
          </form>

          <p className="lgx-help">
            Need access? <a href="mailto:hello@marketivity.com">Contact Marketivity</a>
          </p>
        </div>

        <p className="lgx-secure">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Encrypted connection · Your data stays private
        </p>
      </main>
    </div>
  );
}
