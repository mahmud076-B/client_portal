"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InviteAcceptancePage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login?error=Invalid+or+expired+invitation+link");
      } else {
        setUserEmail(session.user.email || null);
        setSessionChecked(true);
      }
    });
  }, [supabase, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError("Failed to set password. Please try again or contact support.");
      setLoading(false);
    } else {
      // Force refresh of the session to ensure claims are fully propagated before redirect
      await supabase.auth.refreshSession();
      router.push("/dashboard");
      router.refresh(); 
    }
  };

  if (!sessionChecked) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--c900)', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,.2)', borderTopColor: 'var(--white)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--c900)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--white)',
        width: '100%',
        maxWidth: '440px',
        borderRadius: 'var(--r-xl)',
        padding: '3rem 2.5rem',
        boxShadow: 'var(--sh-xl)'
      }}>
        
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
          Marketivity Client Portal
        </div>

        <h2 style={{
          fontFamily: 'var(--fh)', fontSize: '1.5rem',
          fontWeight: 800, letterSpacing: '-.025em', color: 'var(--c900)',
          marginBottom: '.625rem'
        }}>Accept Invitation</h2>
        <p style={{
          fontSize: '.9375rem', color: 'var(--c500)', lineHeight: 1.65,
          marginBottom: '2.5rem'
        }}>Welcome! Please create a secure password to activate your account for <strong style={{color: 'var(--c900)'}}>{userEmail}</strong> and access your dashboard.</p>

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

        <form onSubmit={handleUpdate} noValidate>
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="password" style={{
              display: 'block', fontFamily: 'var(--fh)', fontSize: '.8125rem',
              fontWeight: 600, color: 'var(--c700)', marginBottom: '.5rem'
            }}>New Password</label>
            <input 
              type="password" id="password" name="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '13px 16px',
                fontFamily: 'var(--fb)', fontSize: '.9375rem', color: 'var(--c900)',
                background: 'var(--white)', border: '1.5px solid var(--c200)',
                borderRadius: 'var(--r-md)', outline: 'none'
              }} 
            />
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label htmlFor="confirmPassword" style={{
              display: 'block', fontFamily: 'var(--fh)', fontSize: '.8125rem',
              fontWeight: 600, color: 'var(--c700)', marginBottom: '.5rem'
            }}>Confirm Password</label>
            <input 
              type="password" id="confirmPassword" name="confirmPassword" required
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: '100%', padding: '13px 16px',
                fontFamily: 'var(--fb)', fontSize: '.9375rem', color: 'var(--c900)',
                background: 'var(--white)', border: '1.5px solid var(--c200)',
                borderRadius: 'var(--r-md)', outline: 'none'
              }} 
            />
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
                Activate & Continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
